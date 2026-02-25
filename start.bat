@echo off
REM File Transfer Server - Windows Startup Script

echo.
echo ========================================
echo   File Transfer Server - Starting
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Start the server
echo Starting server on http://localhost:3000
echo.
echo On the same network, access via:
echo   http:/^<YOUR_IP^>:3000
echo.
echo Press Ctrl+C to stop the server
echo.

node server.js

pause
