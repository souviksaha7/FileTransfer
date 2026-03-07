@echo off
REM File Transfer App - Quick Setup for Windows

echo.
echo ======================================================
echo   File Transfer App - Windows Setup
echo ======================================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

echo ✓ Node.js detected: 
node --version

echo.
echo Step 1: Installing dependencies...
echo.
call npm install

if errorlevel 1 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo.
echo ✓ Dependencies installed successfully
echo.

echo ======================================================
echo   Setup Complete! Choose an option:
echo ======================================================
echo.
echo 1. Run web version (default)
echo 2. Run Windows desktop app
echo 3. Build Windows app installer
echo 4. Exit
echo.

set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" (
    echo.
    echo Starting web server...
    echo Open browser at: http://localhost:3000
    echo.
    call npm start
) else if "%choice%"=="2" (
    echo.
    echo Starting Windows app...
    call npm run electron-dev
) else if "%choice%"=="3" (
    echo.
    echo Building Windows app...
    call npm run electron-build
    echo.
    echo ✓ Build complete! Check dist/ folder for .exe files
) else (
    echo Exiting...
)

pause
