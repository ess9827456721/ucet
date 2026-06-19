@echo off

echo Starting Uchet Finansov...
echo.

if not exist node_modules (
    echo Dependencies not installed. Running setup first...
    echo.
    call setup.bat
    if %ERRORLEVEL% neq 0 (
        pause
        exit /b 1
    )
)

npm run dev
