@echo off

echo ================================================
echo   Setup: Uchet Finansov
echo ================================================
echo.
echo Step 1: Checking Node.js...

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERROR] Node.js is NOT installed on this computer.
    echo.
    echo  Please install Node.js first:
    echo    1. Open browser and go to: https://nodejs.org/
    echo    2. Click "Download Node.js (LTS)" - the recommended version
    echo    3. Run the downloaded installer, click Next/Next/Install
    echo    4. RESTART this window after installation
    echo    5. Run setup.bat again
    echo.
    pause
    exit /b 1
)

echo  Node.js found:
node --version
echo.

echo Step 2: Installing dependencies (npm install)...
echo  This may take 2-5 minutes on first run. Please wait.
echo.
npm install

if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERROR] npm install failed.
    echo.
    echo  If the error mentions "better-sqlite3" or "node-gyp":
    echo    1. Install Visual Studio Build Tools from:
    echo       https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo    2. During install select "Desktop development with C++"
    echo    3. Restart your computer
    echo    4. Run setup.bat again
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Setup complete! To start the app run: run.bat
echo ================================================
echo.
pause
