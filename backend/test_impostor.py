import os
import requests

BASE_URL = "http://127.0.0.1:5000"
voter_account = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

dataset_dir = os.path.join(os.path.dirname(__file__), "..", "ml-model", "dataset", "Real")

# Pick any file that does not start with "1__"
impostor_file = None
for f in os.listdir(dataset_dir):
    if not f.startswith("1__") and f.lower().endswith((".bmp", ".png", ".jpg")):
        impostor_file = os.path.join(dataset_dir, f)
        break

if not impostor_file:
    raise FileNotFoundError(f"No impostor fingerprint found in {dataset_dir}")

print(f"Testing Impostor File: {os.path.basename(impostor_file)}")

with open(impostor_file, "rb") as f:
    res = requests.post(
        f"{BASE_URL}/api/verify-and-vote",
        data={"voter_address": voter_account},
        files={"fingerprint": f}
    )

print(f"Status Code: {res.status_code}")
print(f"Server Response: {res.json()}")