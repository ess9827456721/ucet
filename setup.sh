#!/usr/bin/env bash
set -e

echo "================================================"
echo "  Установка зависимостей для «Учёт финансов»"
echo "================================================"
echo

if ! command -v node &>/dev/null; then
    echo "[ОШИБКА] Node.js не найден."
    echo "Установите Node.js (версия 18+): https://nodejs.org/"
    exit 1
fi

NODE_VER=$(node --version)
echo "Node.js: $NODE_VER"

echo
echo "Установка зависимостей (npm install)..."
npm install

echo
echo "================================================"
echo "  Готово! Запустите: npm run dev"
echo "================================================"
