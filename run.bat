@echo off
chcp 65001 >nul
echo Запуск приложения "Учёт финансов"...

if not exist node_modules (
    echo Зависимости не установлены. Запускаю setup.bat...
    call setup.bat
    if %ERRORLEVEL% neq 0 exit /b 1
)

npm run dev
