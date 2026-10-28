import os
import json
from web3 import Web3

RPC_URL = "http://127.0.0.1:8545"
w3 = Web3(Web3.HTTPProvider(RPC_URL))

if not w3.is_connected():
    raise SystemError("Cannot connect to Hardhat node at http://127.0.0.1:8545. Make sure 'npx hardhat node' is running.")

# Path to Hardhat compilation artifact
ARTIFACT_PATH = os.path.join(
    os.path.dirname(__file__), 
    "..", "blockchain", "artifacts", "contracts", "Voting.sol", "Voting.json"
)

if not os.path.exists(ARTIFACT_PATH):
    raise FileNotFoundError(f"Artifact not found at {ARTIFACT_PATH}. Run 'npx hardhat compile' inside the blockchain folder.")

with open(ARTIFACT_PATH, "r") as f:
    artifact = json.load(f)

abi = artifact["abi"]
bytecode = artifact["bytecode"]

deployer = w3.eth.accounts[0]
print(f"Deploying from account: {deployer}")

VotingContract = w3.eth.contract(abi=abi, bytecode=bytecode)

# Constructor parameters - Official Department Nominees from Student Roster
candidates = [
    "Pranitha C Poojary (NNM23IS134)",
    "Srajan J Poojary (NNM22IS173)",
    "Aashna Mathias (NNM23IS001)",
    "Abhimanyu Rai B S (NNM23IS002)",
    "Pranjali N (NNM23IS135)",
    "Raksha S Suvarna (NNM23IS143)",
    "Nireeksha (NNM23IS111)",
    "H Nihal Shetty (NNM23IS074)",
    "Rishika Rajesh Kumar (NNM23IS147)",
    "Spoorthi (NNM23IS183)"
]

# Send deployment transaction
tx_hash = VotingContract.constructor(candidates).transact({"from": deployer})
tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

contract_address = tx_receipt.contractAddress

print("\n=======================================================")
print(f"Voting contract deployed successfully to: {contract_address}")
print("=======================================================")

# Save address locally for the backend services
addr_path = os.path.join(os.path.dirname(__file__), "contract_address.txt")
with open(addr_path, "w") as f:
    f.write(contract_address)

print(f"Contract address saved to: {addr_path}")