@echo off
title Secure E-Voting System (NMAMIT Project Code 08)
color 0b
echo ==================================================================
echo       SECURE E-VOTING SYSTEM (NMAMIT PROJECT CODE 08)
echo   Siamese CNN Fingerprint Recognition & Ethereum Blockchain Ledger
echo ==================================================================
echo.
cd /d "%~dp0"
if exist "venv\Scripts\python.exe" (
    venv\Scripts\python.exe run_all.py
) else (
    python run_all.py
)
pause
