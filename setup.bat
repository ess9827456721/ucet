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
echo.

rem Tell prebuild-install to fetch the Electron prebuilt binary for better-sqlite3
rem instead of compiling from source (which requires Visual Studio Build Tools).
set npm_config_runtime=electron
set npm_config_target=29.1.1
set npm_config_dist_url=https://releases.electronjs.org/headers

call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERROR] npm install failed. See errors above.
    echo.
    echo  Common fixes:
    echo    - Make sure your internet connection is working
    echo    - Delete the node_modules folder and run setup.bat again
    echo    - If the error mentions a network timeout, try again later
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
