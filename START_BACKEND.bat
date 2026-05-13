@echo off
REM Start Smart Clinical Management System

echo.
echo ==========================================
echo Smart Clinical Management System Startup
echo ==========================================
echo.

echo [1/2] Starting Backend Server...
echo.

cd /d "%~dp0backend"
python app.py

pause
