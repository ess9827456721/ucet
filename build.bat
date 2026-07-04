@echo off

echo ================================================
echo   Build installer: Uchet Finansov
echo ================================================
echo.

if not exist node_modules (
    echo  Dependencies not found. Running setup first...
    echo.
    call setup.bat
    if %ERRORLEVEL% neq 0 exit /b 1
)

echo Step 1: Compiling the app...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERROR] Build failed. See errors above.
    pause
    exit /b 1
)

echo.
echo Step 2: Packaging into installer (.exe)...
echo  This may take several minutes. Please wait.
echo.
call npx electron-builder --win
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERROR] Packaging failed. See errors above.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Done! Installer is in the dist\ folder.
echo   Look for a file named Uchet Finansov Setup *.exe
echo ================================================
echo.
pause
