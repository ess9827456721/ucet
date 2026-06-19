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
    echo    2. Click "Download Node.js (LTS)"
    echo    3. Run the downloaded installer, click Next/Next/Install
    echo    4. CLOSE this window, then open it again
    echo    5. Run setup.bat again
    echo.
    pause
    exit /b 1
)

echo  Node.js found:
node --version
echo.

echo Step 2: Installing dependencies...
echo  This may take 5-10 minutes on first run. Please wait.
echo  (It will also compile the SQLite module for Electron.)
echo.
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERROR] npm install failed.
    echo.
    echo  If the error mentions "better-sqlite3", "node-gyp", or "C++":
    echo    1. Install Visual Studio Build Tools from:
    echo       https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo    2. In the installer, select "Desktop development with C++"
    echo       and make sure "MSVC v143" and "Windows SDK" are checked.
    echo    3. Restart your computer after the install completes.
    echo    4. Run setup.bat again.
    echo.
    echo  If you already have Visual Studio Build Tools installed,
    echo  try running this in a "Developer Command Prompt for VS".
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Setup complete!
echo.
echo   WHAT TO DO NEXT:
echo     run.bat   - launch the app directly (no installer)
echo     build.bat - create a .exe installer in dist\
echo ================================================
echo.
pause
