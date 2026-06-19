@echo off

echo ================================================
echo   Setup: Uchet Finansov
echo ================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found.
    echo Please download and install Node.js from https://nodejs.org/
    echo Recommended: LTS version 18 or newer.
    echo.
    pause
    exit /b 1
)

node --version
echo Node.js found. OK.
echo.

echo Running npm install...
echo This may take a few minutes on first run.
echo.
npm install

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] npm install failed.
    echo.
    echo If the error mentions "better-sqlite3" or "node-gyp", you need
    echo Visual Studio Build Tools (C++ compiler):
    echo https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo Select "Desktop development with C++" during installation.
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Done! Run the app with: run.bat
echo ================================================
echo.
pause
