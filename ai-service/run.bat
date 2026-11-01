@echo off
cd /d "%~dp0"
echo ========================================================
echo Starting SRLMS AI Microservice (FastAPI on Port 8001)...
echo ========================================================
call .\venv\Scripts\activate.bat
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
pause
