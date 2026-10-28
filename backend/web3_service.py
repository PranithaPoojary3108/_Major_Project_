import os
import json
from web3 import Web3

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")
w3 = Web3(Web3.HTTPProvider(RPC_URL))

BLOCKCHAIN_UNAVAILABLE_MESSAGE = (
    f"Blockchain node is unavailable at {RPC_URL}. "
    "Start it with 'npx hardhat node' in the blockchain folder, "
    "then deploy the contract with 'python deploy_contract.py'."
)

class BlockchainUnavailableError(RuntimeError):
    """Raised when the configured Ethereum node cannot be reached."""

class VoterAccountUnavailableError(ValueError):
    """Raised when a voter wallet is not unlocked by the configured node."""

def ensure_connected():
    try:
        if not w3.is_connected():
            raise BlockchainUnavailableError(BLOCKCHAIN_UNAVAILABLE_MESSAGE)
    except BlockchainUnavailableError:
        raise
    except Exception as exc:
        raise BlockchainUnavailableError(BLOCKCHAIN_UNAVAILABLE_MESSAGE) from exc

def ensure_voter_account_available(voter_address):
    try:
        checksum_address = Web3.to_checksum_address(voter_address)
    except (TypeError, ValueError) as exc:
        raise VoterAccountUnavailableError(
            "Enter a valid Ethereum wallet address."
        ) from exc

    try:
        available_accounts = {Web3.to_checksum_address(account) for account in w3.eth.accounts}
        if checksum_address not in available_accounts:
            # Dynamically impersonate and fund student account on Hardhat node
            try:
                w3.provider.make_request("hardhat_impersonateAccount", [checksum_address])
                w3.provider.make_request("hardhat_setBalance", [checksum_address, "0x21e19e0c9bab2400000"])  # 10,000 ETH
            except Exception:
                raise VoterAccountUnavailableError(
                    f"Wallet {checksum_address} is not an unlocked account on the local node. "
                    "Select one of the accounts from the accounts list."
                )
    except Exception as exc:
        if isinstance(exc, VoterAccountUnavailableError):
            raise
        # If node not connected, re-raise connection error
        raise BlockchainUnavailableError(BLOCKCHAIN_UNAVAILABLE_MESSAGE) from exc

    return checksum_address

ARTIFACT_PATH = os.path.join(
    os.path.dirname(__file__), 
    "..", "blockchain", "artifacts", "contracts", "Voting.sol", "Voting.json"
)
ADDRESS_PATH = os.path.join(os.path.dirname(__file__), "contract_address.txt")

def get_deployed_address():
    if os.path.exists(ADDRESS_PATH):
        with open(ADDRESS_PATH, "r") as f:
            addr = f.read().strip()
            if addr:
                return addr
    return "0x5FbDB2315678afecb367f032d93F642f64180aa3"

def get_contract():
    ensure_connected()
    if not os.path.exists(ARTIFACT_PATH):
        raise FileNotFoundError(f"Artifact missing at {ARTIFACT_PATH}")
    with open(ARTIFACT_PATH, "r") as f:
        artifact = json.load(f)
    abi = artifact["abi"]
    contract_addr = Web3.to_checksum_address(get_deployed_address())
    return w3.eth.contract(address=contract_addr, abi=abi)

def is_connected():
    try:
        return w3.is_connected()
    except Exception:
        return False

STUDENT_ACCOUNT_MAPPING = [
    {"role": "Election Commissioner (Guide: Ms. Tanzila Nargis)", "name": "Ms. Tanzila Nargis", "usn": "FACULTY_ISE"},
    {"role": "Voter (Pranitha C Poojary)", "name": "PRANITHA C POOJARY", "usn": "NNM23IS134"},
    {"role": "Voter (Pranjali N)", "name": "PRANJALI N", "usn": "NNM23IS135"},
    {"role": "Voter (Raksha S Suvarna)", "name": "RAKSHA S SUVARNA", "usn": "NNM23IS143"},
    {"role": "Voter (Nireeksha)", "name": "NIREEKSHA", "usn": "NNM23IS111"},
    {"role": "Voter (Srajan J Poojary)", "name": "SRAJAN J POOJARY", "usn": "NNM22IS173"},
    {"role": "Voter (Aashna Mathias)", "name": "AASHNA MATHIAS", "usn": "NNM23IS001"},
    {"role": "Voter (Abhimanyu Rai B S)", "name": "ABHIMANYU RAI B S", "usn": "NNM23IS002"},
    {"role": "Voter (H Nihal Shetty)", "name": "H NIHAL SHETTY", "usn": "NNM23IS074"},
    {"role": "Voter (Rishika Rajesh Kumar)", "name": "RISHIKA RAJESH KUMAR", "usn": "NNM23IS147"},
    {"role": "Voter (Spoorthi)", "name": "SPOORTHI", "usn": "NNM23IS183"},
    {"role": "Voter (Vachan J Poojary)", "name": "VACHAN J POOJARY", "usn": "NNM23IS205"},
    {"role": "Voter (Abhishek Acharya)", "name": "ABHISHEK ACHARYA", "usn": "NNM23IS003"},
    {"role": "Voter (Aditi Sandikar)", "name": "ADITI SANDIKAR", "usn": "NNM23IS006"},
    {"role": "Voter (Akshatha Kini)", "name": "AKSHATHA KINI", "usn": "NNM23IS009"},
    {"role": "Voter (Ananya Shetty)", "name": "ANANYA SHETTY", "usn": "NNM23IS012"},
    {"role": "Voter (Anvitha V Rao)", "name": "ANVITHA V RAO", "usn": "NNM23IS020"},
    {"role": "Voter (Deeksha Yogish Kotian)", "name": "DEEKSHA YOGISH KOTIAN", "usn": "NNM23IS041"},
    {"role": "Voter (Dhanush D Shetty)", "name": "DHANUSH D SHETTY", "usn": "NNM23IS048"},
    {"role": "Voter (Sanjana Kini B)", "name": "SANJANA KINI B", "usn": "NNM23IS161"}
]

def get_accounts():
    """Returns available test accounts from the node with their role labels and balances."""
    if not is_connected():
        return []

    accounts = []
    try:
        for idx, acc in enumerate(w3.eth.accounts[:20]):
            bal_wei = w3.eth.get_balance(acc)
            bal_eth = round(float(w3.from_wei(bal_wei, "ether")), 2)
            meta = STUDENT_ACCOUNT_MAPPING[idx] if idx < len(STUDENT_ACCOUNT_MAPPING) else {
                "role": f"Voter Account #{idx}",
                "name": f"Student #{idx}",
                "usn": f"NNM23IS{idx:03d}"
            }
            accounts.append({
                "index": idx,
                "address": acc,
                "role": meta["role"],
                "student_name": meta["name"],
                "usn": meta["usn"],
                "balance": f"{bal_eth} ETH"
            })
    except Exception:
        pass
    return accounts

def get_voter_onchain_status(voter_address):
    """Queries on-chain voter struct: isRegistered, hasVoted, biometricHash."""
    if not is_connected():
        return {"isRegistered": False, "hasVoted": False, "biometricHash": None}

    try:
        contract = get_contract()
        checksum_addr = Web3.to_checksum_address(voter_address)
        is_registered, has_voted, bio_hash = contract.functions.voters(checksum_addr).call()
        return {
            "isRegistered": is_registered,
            "hasVoted": has_voted,
            "biometricHash": ("0x" + bio_hash.hex()) if bio_hash and bio_hash != b"\x00"*32 else None
        }
    except Exception:
        return {"isRegistered": False, "hasVoted": False, "biometricHash": None}

def get_audit_trail():
    """
    Fetches immutable blockchain events and recent mined blocks for the public ledger view.
    """
    if not is_connected():
        return {"events": [], "latest_block": 0, "contract_address": get_deployed_address()}

    try:
        contract = get_contract()
        current_block = w3.eth.block_number

        events = []

        # 1. Registration Events
        reg_filter = contract.events.VoterRegistered.create_filter(from_block=0, to_block="latest")
        for log in reg_filter.get_all_entries():
            events.append({
                "type": "VOTER_REGISTERED",
                "block_number": log.blockNumber,
                "transaction_hash": log.transactionHash.hex(),
                "voter": log.args.voterAddress,
                "biometric_hash": "0x" + log.args.biometricHash.hex(),
                "timestamp": None
            })

        # 2. Vote Cast Events
        vote_filter = contract.events.VoteCasted.create_filter(from_block=0, to_block="latest")
        for log in vote_filter.get_all_entries():
            events.append({
                "type": "VOTE_CASTED",
                "block_number": log.blockNumber,
                "transaction_hash": log.transactionHash.hex(),
                "voter": log.args.voterAddress,
                "candidate_id": log.args.candidateId,
                "timestamp": None
            })

        # Sort events by block number descending
        events.sort(key=lambda x: x["block_number"], reverse=True)

        return {
            "events": events,
            "latest_block": current_block,
            "contract_address": get_deployed_address()
        }
    except Exception as e:
        return {
            "events": [],
            "latest_block": 0,
            "contract_address": get_deployed_address(),
            "error": str(e)
        }