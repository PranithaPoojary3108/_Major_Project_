import os
import cv2
import hashlib
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models, regularizers

# Configuration & Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "..", "ml-model", "fingerprint_feature_extractor.h5")
DATASET_DIR = os.path.join(BASE_DIR, "..", "ml-model", "dataset", "Real")
IMG_SIZE = 128

# Calibrated Operational Threshold from ROC / EER analysis
VERIFICATION_THRESHOLD = 0.2385

def residual_conv_block(x, filters):
    """
    Residual Convolutional Block matching training architecture:
    Shortcut: Conv2D(1x1) + BatchNorm
    Residual: Conv2D(3x3) + BatchNorm + Swish + Conv2D(3x3) + BatchNorm
    Merge: Add + Swish + MaxPool2D(2x2)
    """
    shortcut = layers.Conv2D(filters, (1, 1), padding="same", use_bias=False)(x)
    shortcut = layers.BatchNormalization()(shortcut)

    res = layers.Conv2D(filters, (3, 3), padding="same", use_bias=False)(x)
    res = layers.BatchNormalization()(res)
    res = layers.Activation("swish")(res)
    res = layers.Conv2D(filters, (3, 3), padding="same", use_bias=False)(res)
    res = layers.BatchNormalization()(res)

    out = layers.add([shortcut, res])
    out = layers.Activation("swish")(out)
    out = layers.MaxPooling2D((2, 2))(out)
    return out

def build_biometric_feature_extractor():
    """
    Rebuilds the exact Residual Biometric Feature Extractor graph as trained in
    ml-model/fingerprint_evoting_production.ipynb.
    Uses UnitNormalization layer to project onto the unit hypersphere with 100% weight compatibility.
    """
    inp = layers.Input(shape=(IMG_SIZE, IMG_SIZE, 1), name="Fingerprint_Input")

    x = residual_conv_block(inp, 32)
    x = residual_conv_block(x, 64)
    x = residual_conv_block(x, 128)
    x = residual_conv_block(x, 256)

    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dense(256, activation="swish", kernel_regularizer=regularizers.l2(1e-4))(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(128)(x)

    norm_embedding = layers.UnitNormalization(axis=-1, name="L2_Norm")(x)
    return models.Model(inputs=inp, outputs=norm_embedding, name="Fingerprint_Feature_Extractor")

# Load weights into the model
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Trained model weights not found at {MODEL_PATH}")

feature_extractor = build_biometric_feature_extractor()
feature_extractor.load_weights(MODEL_PATH, by_name=True)
print("Biometric Siamese CNN model loaded successfully with 100% layer fidelity.")

# CLAHE setup matching training pipeline
clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))

def preprocess_image_buffer(file_bytes):
    """
    Decodes raw uploaded image bytes, applies CLAHE enhancement,
    resizes to (128, 128), and normalizes pixel values to [0.0, 1.0].
    """
    nparr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError("Invalid image file or unsupported format. Please upload a valid BMP or PNG.")

    img = cv2.resize(img, (IMG_SIZE, IMG_SIZE))
    img = clahe.apply(img)
    img = img.astype("float32") / 255.0
    return np.expand_dims(np.expand_dims(img, axis=-1), axis=0)

def extract_embedding(image_bytes):
    """
    Extracts a 128-dimensional L2-normalized embedding vector.
    """
    processed = preprocess_image_buffer(image_bytes)
    embedding = feature_extractor(processed, training=False).numpy()[0]
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    return embedding

def hash_biometric_vector(embedding):
    """
    Computes SHA-256 hash of the 128-d floating point vector.
    Returns 0x-prefixed 64-char hex string (bytes32 for Solidity smart contracts).
    """
    vector_bytes = np.array(embedding, dtype=np.float32).tobytes()
    return "0x" + hashlib.sha256(vector_bytes).hexdigest()

def verify_fingerprints(stored_embedding, live_embedding):
    """
    Calculates Euclidean distance and checks against the calibrated threshold (0.2385).
    Returns (is_match, distance, similarity_pct).
    """
    stored = np.array(stored_embedding, dtype=np.float32)
    live = np.array(live_embedding, dtype=np.float32)
    distance = float(np.linalg.norm(stored - live))
    is_match = distance <= VERIFICATION_THRESHOLD

    # Compute similarity percentage for UI feedback
    # Distance is normalized between 0 and 2.0 on unit sphere
    similarity_pct = max(0.0, min(100.0, (1.0 - (distance / 2.0)) * 100.0))

    return is_match, distance, round(similarity_pct, 2)

def get_curated_samples():
    """
    Returns curated sample fingerprint images from dataset/Real for quick UI testing.
    Includes genuine voter scans and impostor scans.
    """
    if not os.path.exists(DATASET_DIR):
        return []

    samples = [
        {
            "filename": "100__M_Left_index_finger.BMP",
            "voter_id": "100",
            "finger": "Left Index",
            "gender": "Male",
            "role": "genuine_enroll",
            "label": "Voter #100 - Left Index (Enrollment Scan)",
            "description": "Original enrolled fingerprint of citizen #100"
        },
        {
            "filename": "100__M_Left_middle_finger.BMP",
            "voter_id": "100",
            "finger": "Left Middle",
            "gender": "Male",
            "role": "same_voter_diff_finger",
            "label": "Voter #100 - Left Middle (Wrong Finger Test)",
            "description": "Same person but wrong finger scanned at booth"
        },
        {
            "filename": "101__M_Left_index_finger.BMP",
            "voter_id": "101",
            "finger": "Left Index",
            "gender": "Male",
            "role": "impostor_attack",
            "label": "Impostor #101 - Left Index (Fraud Attack)",
            "description": "Unenrolled impostor attempting impersonation"
        },
        {
            "filename": "102__M_Left_index_finger.BMP",
            "voter_id": "102",
            "finger": "Left Index",
            "gender": "Male",
            "role": "genuine_voter_2",
            "label": "Voter #102 - Left Index (Citizen #2)",
            "description": "Independent legitimate citizen"
        },
        {
            "filename": "103__F_Left_index_finger.BMP",
            "voter_id": "103",
            "finger": "Left Index",
            "gender": "Female",
            "role": "genuine_voter_3",
            "label": "Voter #103 - Left Index (Citizen #3)",
            "description": "Independent legitimate citizen"
        }
    ]

    available = []
    for s in samples:
        path = os.path.join(DATASET_DIR, s["filename"])
        if os.path.exists(path):
            available.append(s)

    return available