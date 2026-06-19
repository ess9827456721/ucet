@echo off
chcp 65001 >nul
echo ================================================
echo   Установка зависимостей для "Учёт финансов"
echo ================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ОШИБКА] Node.js не найден.
    echo Скачайте и установите Node.js с https://nodejs.org/
    echo Рекомендуется версия LTS (18 или новее).
    pause
    exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node --version') do set NODE_VER=%%a
echo Node.js найден.

echo.
echo Установка зависимостей (npm install)...
npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ОШИБКА] npm install завершился с ошибкой.
    echo Если ошибка связана с better-sqlite3, установите Visual Studio Build Tools:
    echo https://visualstudio.microsoft.com/visual-cpp-build-tools/
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Готово! Для запуска используйте: run.bat
echo ================================================
pause
