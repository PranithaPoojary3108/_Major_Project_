import os
import requests
from web3 import Web3
from web3_service import get_contract, w3

BASE_URL = "http://127.0.0.1:5000"

# Target voter account (Account 2)
voter_account = w3.eth.accounts[2]

# Automatically find an existing real fingerprint image
dataset_dir = os.path.join(os.path.dirname(__file__), "..", "ml-model", "dataset", "Real")
available_files = [
    f for f in os.listdir(dataset_dir) 
    if f.lower().endswith((".bmp", ".png", ".jpg"))
]

if not available_files:
    raise FileNotFoundError(f"No fingerprint files found in {dataset_dir}")

sample_fingerprint = os.path.join(dataset_dir, available_files[0])

print(f"--- Simulating Voter: {voter_account} ---")
print(f"Using Fingerprint File: {available_files[0]}")

# Step 1: Register Biometric Template Off-Chain
print("\n1. Enrolling Biometric Template...")
with open(sample_fingerprint, "rb") as f:
    res = requests.post(
        f"{BASE_URL}/api/register-voter", 
        data={"voter_address": voter_account}, 
        files={"fingerprint": f}
    )
enroll_data = res.json()
print("Response:", enroll_data)

if not enroll_data.get("success"):
    print("Enrollment failed. Halting simulation.")
    exit(1)

bio_hash = enroll_data["biometric_hash"]

# Step 2: Register Voter on Blockchain
print("\n2. Registering Voter On-Chain...")
res = requests.post(
    f"{BASE_URL}/api/register-onchain", 
    json={"voter_address": voter_account, "biometric_hash": bio_hash}
)
print("Response:", res.json())

# Step 3: Biometric Verification at Voting Booth
print("\n3. Verifying Live Biometric at Booth...")
with open(sample_fingerprint, "rb") as f:
    res = requests.post(
        f"{BASE_URL}/api/verify-and-vote", 
        data={"voter_address": voter_account}, 
        files={"fingerprint": f}
    )
auth_data = res.json()
print("Auth Result:", auth_data)

# Step 4: Cast Ballot On-Chain
if auth_data.get("verified"):
    print("\n4. Casting Vote on Blockchain for Candidate 2 (Bob)...")
    contract = get_contract()
    tx_hash = contract.functions.castVote(
        2, bytes.fromhex(bio_hash.replace("0x", ""))
    ).transact({"from": voter_account})
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"Vote cast! Transaction hash: {receipt.transactionHash.hex()}")
else:
    print("Biometric verification failed. Ballot denied.")

# Step 5: Check Live Results
print("\n5. Querying Current Tally...")
res = requests.get(f"{BASE_URL}/api/candidates")
print("Election Standings:", res.json())