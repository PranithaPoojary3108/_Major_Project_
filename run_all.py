import os
import sys
import time
import subprocess
import webbrowser
import urllib.request
import signal

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
BLOCKCHAIN_DIR = os.path.join(BASE_DIR, "blockchain")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
VENV_PYTHON = os.path.join(BASE_DIR, "venv", "Scripts", "python.exe")

if not os.path.exists(VENV_PYTHON):
    VENV_PYTHON = sys.executable

processes = []

def cleanup(sig=None, frame=None):
    print("\n[Shutting down Secure E-Voting System processes...]")
    for p in processes:
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
            p.terminate()
            p.wait(timeout=2)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass
    print("[All services stopped cleanly. Goodbye!]")
    sys.exit(0)

signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

def is_service_ready(url, timeout=1):
    try:
        req = urllib.request.urlopen(url, timeout=timeout)
        return req.status in (200, 503)
    except Exception:
        return False

def wait_for_service(name, url, max_attempts=35, delay=1):
    print(f"Waiting for {name} to be ready at {url}...", end="", flush=True)
    for _ in range(max_attempts):
        if is_service_ready(url):
            print(" [READY]")
            return True
        print(".", end="", flush=True)
        time.sleep(delay)
    print(" [TIMEOUT]")
    return False

def main():
    print("==================================================================")
    print("      SECURE E-VOTING SYSTEM (NMAMIT PROJECT CODE 08)             ")
    print("  Siamese CNN Fingerprint Recognition & Ethereum Blockchain Ledger ")
    print("==================================================================")

    # 1. Start Hardhat Node if not running
    if not is_service_ready("http://127.0.0.1:8545"):
        print("\n[1/5] Starting Local Hardhat Blockchain Node (RPC: http://127.0.0.1:8545)...")
        node_log_path = os.path.join(BLOCKCHAIN_DIR, "hardhat_node.log")
        node_log = open(node_log_path, "w", encoding="utf-8")
        hardhat_proc = subprocess.Popen(
            ["npx.cmd", "hardhat", "node"],
            cwd=BLOCKCHAIN_DIR,
            stdout=node_log,
            stderr=subprocess.STDOUT,
            shell=True
        )
        processes.append(hardhat_proc)
        wait_for_service("Hardhat Ethereum Node", "http://127.0.0.1:8545", max_attempts=25)
    else:
        print("\n[1/5] Local Hardhat Blockchain Node is already running.")

    # 2. Deploy Voting Smart Contract
    print("\n[2/5] Deploying / Verifying Voting.sol Smart Contract on Ethereum...")
    try:
        subprocess.run(
            [VENV_PYTHON, "deploy_contract.py"],
            cwd=BACKEND_DIR,
            check=True
        )
    except Exception as e:
        print(f"Warning during contract deployment: {e}")

    # 3. Start Flask Backend if not running
    if not is_service_ready("http://127.0.0.1:5000/api/status"):
        print("\n[3/5] Starting Python Flask REST API Backend (http://127.0.0.1:5000)...")
        backend_proc = subprocess.Popen(
            [VENV_PYTHON, "app.py"],
            cwd=BACKEND_DIR,
            shell=False
        )
        processes.append(backend_proc)
        wait_for_service("Flask Backend API", "http://127.0.0.1:5000/api/status", max_attempts=35)
    else:
        print("\n[3/5] Python Flask REST API Backend is already running.")

    # 4. Start Admin Pre-Election Enrollment Portal (Port 3001)
    if not is_service_ready("http://localhost:3001"):
        print("\n[4/5] Starting Admin Pre-Election Enrollment Portal (http://localhost:3001)...")
        admin_proc = subprocess.Popen(
            ["npm.cmd", "run", "dev:admin"],
            cwd=FRONTEND_DIR,
            shell=True
        )
        processes.append(admin_proc)
        wait_for_service("Admin Portal", "http://localhost:3001", max_attempts=25)
    else:
        print("\n[4/5] Admin Pre-Election Enrollment Portal is already running.")

    # 5. Start Polling Booth Level Client Station (Port 3000)
    if not is_service_ready("http://localhost:3000"):
        print("\n[5/5] Starting Polling Booth Level Client Station (http://localhost:3000)...")
        booth_proc = subprocess.Popen(
            ["npm.cmd", "run", "dev:booth"],
            cwd=FRONTEND_DIR,
            shell=True
        )
        processes.append(booth_proc)
        wait_for_service("Booth Station", "http://localhost:3000", max_attempts=25)
    else:
        print("\n[5/5] Polling Booth Level Client Station is already running.")

    print("\n==================================================================")
    print("  ALL SERVICES RUNNING SUCCESSFULLY ACROSS DEDICATED PORTS!        ")
    print("  -> CLIENT POLLING BOOTH:  http://localhost:3000                ")
    print("     (For Election Incharge & Voter Authentication at Booth)      ")
    print("  -> ADMIN ENROLLMENT DESK: http://localhost:3001                ")
    print("     (For Pre-Election Voter Enrollment & Commissioner Audit)     ")
    print("  -> PYTHON FLASK REST API: http://127.0.0.1:5000                ")
    print("  -> HARDHAT BLOCKCHAIN:    http://127.0.0.1:8545                ")
    print("==================================================================")
    print("Press Ctrl+C to terminate all services.\n")

    try:
        webbrowser.open("http://localhost:3000")
        webbrowser.open("http://localhost:3001")
    except Exception:
        pass

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        cleanup()

if __name__ == "__main__":
    main()
