@echo off
REM Start Frontend Server

echo.
echo ==========================================
echo Smart Clinical Management System Frontend
echo ==========================================
echo.

cd /d "%~dp0"

echo [2/2] Starting Frontend Server on port 8000...
echo.
echo Frontend will be available at: http://localhost:8000
echo.

python -m http.server 8000 --directory frontend

pause
