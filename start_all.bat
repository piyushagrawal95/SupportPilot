@echo off
echo ===================================================
echo Starting CloudNotes and SupportPilot Systems...
echo ===================================================

start "SupportPilot Backend (Port 8001)" cmd /k "cd /d C:\Users\astrea\Desktop\cloudnotes\supportpilot\supportpilotapp\backend && uvicorn app.main:app --port 8001 --reload"
start "SupportPilot Frontend (Port 5174)" cmd /k "cd /d C:\Users\astrea\Desktop\cloudnotes\supportpilot\supportpilotapp\frontend && npm run dev"
start "CloudNotes Backend (Port 8000)" cmd /k "cd /d C:\Users\astrea\Desktop\cloudnotes\supportpilot\cloudnotes\backend && uvicorn app.main:app --port 8000 --reload"
start "CloudNotes Frontend (Port 5173)" cmd /k "cd /d C:\Users\astrea\Desktop\cloudnotes\supportpilot\cloudnotes\frontend && npm run dev"

echo.
echo All 4 services have been launched in separate windows!
echo - CloudNotes: http://localhost:5173
echo - SupportPilot Staff: http://localhost:5174
echo.
pause
