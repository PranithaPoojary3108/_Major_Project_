import os
import json
from web3 import Web3
from database import (
    init_db,
    get_all_enrolled_voters,
    get_all_cast_ballots,
    get_election_lifecycle,
    update_election_lifecycle
)

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")
w3 = Web3(Web3.HTTPProvider(RPC_URL))

if not w3.is_connected():
    raise ConnectionError(
        f"Cannot connect to the Ethereum JSON-RPC node at {RPC_URL}. "
        "Start it with 'npx hardhat node' from the blockchain folder, "
        "wait until it reports that the RPC server is listening, and try again."
    )

ARTIFACT_PATH = os.path.join(
    os.path.dirname(__file__), 
    "..", "blockchain", "artifacts", "contracts", "Voting.sol", "Voting.json"
)
ADDRESS_PATH = os.path.join(os.path.dirname(__file__), "contract_address.txt")

if not os.path.exists(ARTIFACT_PATH):
    raise FileNotFoundError(f"Artifact not found at {ARTIFACT_PATH}. Run 'npx hardhat compile' inside the blockchain folder.")

with open(ARTIFACT_PATH, "r") as f:
    artifact = json.load(f)

abi = artifact["abi"]
bytecode = artifact["bytecode"]
deployer = w3.eth.accounts[0]

# Initialize database schema
init_db()

def is_contract_deployed_and_alive(address):
    """Checks whether the address contains deployed EVM bytecode on the running node."""
    if not address:
        return False
    try:
        checksum = Web3.to_checksum_address(address)
        code = w3.eth.get_code(checksum)
        return len(code) > 2
    except Exception:
        return False

def deploy_new_contract():
    """Deploys a fresh instance of Voting.sol to Ethereum."""
    print(f"Deploying Voting.sol from commissioner account: {deployer}")
    VotingContract = w3.eth.contract(abi=abi, bytecode=bytecode)

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

    tx_hash = VotingContract.constructor(candidates).transact({"from": deployer})
    tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    new_address = tx_receipt.contractAddress

    with open(ADDRESS_PATH, "w") as f:
        f.write(new_address)

    print(f"Contract deployed to: {new_address}")
    return new_address

def rehydrate_contract_from_db(contract_addr):
    """
    Re-registers all enrolled voters, restores election window,
    and re-casts all recorded ballots from evoting.db onto the smart contract.
    """
    contract = w3.eth.contract(address=Web3.to_checksum_address(contract_addr), abi=abi)

    # 1. Re-register all enrolled voters from database
    enrolled_voters = get_all_enrolled_voters()
    if enrolled_voters:
        print(f"Re-registering {len(enrolled_voters)} enrolled voters on-chain from database...")
        for v in enrolled_voters:
            try:
                checksum = Web3.to_checksum_address(v["checksum_address"])
                bio_hash_bytes = bytes.fromhex(v["biometric_hash"].replace("0x", ""))
                is_reg, _, _ = contract.functions.voters(checksum).call()
                if not is_reg:
                    tx = contract.functions.registerVoter(checksum, bio_hash_bytes).transact({"from": deployer})
                    w3.eth.wait_for_transaction_receipt(tx)
            except Exception as e:
                print(f"  Warning registering {v['voter_address']}: {e}")

    # 2. Restore Election Timing / Open state
    lifecycle = get_election_lifecycle()
    status = lifecycle.get("status", 0)

    if status in (1, 2): # Was Open or Closed
        try:
            latest_block = w3.eth.get_block("latest")
            current_time = latest_block.timestamp
            start_ts = lifecycle.get("start_time")
            end_ts = lifecycle.get("end_time")

            # Snap start_ts so voting is open
            if not start_ts or start_ts <= current_time + 300:
                start_ts = max(0, current_time - 10)
            if not end_ts or end_ts <= start_ts:
                end_ts = start_ts + 14400

            onchain_status, _, _, _, _ = contract.functions.getElectionInfo().call()
            if onchain_status == 0:
                print(f"Re-opening election on-chain ({start_ts} to {end_ts})...")
                tx = contract.functions.openElection(start_ts, end_ts).transact({"from": deployer})
                w3.eth.wait_for_transaction_receipt(tx)
        except Exception as e:
            print(f"  Warning restoring election window: {e}")

    # 3. Re-cast all recorded ballots onto smart contract
    ballots = get_all_cast_ballots()
    if ballots:
        print(f"Re-casting {len(ballots)} persistent ballots from database onto smart contract...")
        available_accounts = {Web3.to_checksum_address(acc) for acc in w3.eth.accounts}

        for b in ballots:
            try:
                voter_chk = Web3.to_checksum_address(b["checksum_address"])
                if voter_chk not in available_accounts:
                    try:
                        w3.provider.make_request("hardhat_impersonateAccount", [voter_chk])
                        w3.provider.make_request("hardhat_setBalance", [voter_chk, "0x21e19e0c9bab2400000"])
                    except Exception:
                        pass

                bio_hash_bytes = bytes.fromhex(b["biometric_hash"].replace("0x", ""))
                _, has_voted, _ = contract.functions.voters(voter_chk).call()
                if not has_voted:
                    tx = contract.functions.castVote(b["candidate_id"], bio_hash_bytes).transact({"from": voter_chk})
                    w3.eth.wait_for_transaction_receipt(tx)
            except Exception as e:
                print(f"  Warning casting ballot for {b['voter_address']}: {e}")

    # 4. If election was closed, close it
    if status == 2:
        try:
            onchain_status, _, _, _, _ = contract.functions.getElectionInfo().call()
            if onchain_status == 1:
                print("Closing election on-chain as per database record...")
                tx = contract.functions.closeElection().transact({"from": deployer})
                w3.eth.wait_for_transaction_receipt(tx)
        except Exception as e:
            print(f"  Warning closing election: {e}")

def main():
    existing_addr = None
    if os.path.exists(ADDRESS_PATH):
        with open(ADDRESS_PATH, "r") as f:
            existing_addr = f.read().strip()

    if existing_addr and is_contract_deployed_and_alive(existing_addr):
        print(f"[Contract Active] Existing Voting contract at {existing_addr} is alive on Ethereum.")
        update_election_lifecycle(contract_address=existing_addr)
        return

    # If Hardhat node was restarted fresh, deploy fresh contract and re-hydrate from database
    print("[Contract Deployment] Deploying Voting.sol and synchronizing with SQLite database...")
    new_addr = deploy_new_contract()
    update_election_lifecycle(contract_address=new_addr)

    # Re-hydrate contract with all existing enrolled voters, timing, and votes
    rehydrate_contract_from_db(new_addr)
    print("Database and smart contract are synchronized and ready!")

if __name__ == "__main__":
    main()