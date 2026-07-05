#!/usr/bin/env bash
set -e

echo "================================================"
echo "  Installing dependencies for Uchet Finansov"
echo "================================================"
echo

if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js not found."
    echo "Install Node.js (version 18+): https://nodejs.org/"
    exit 1
fi

NODE_VER=$(node --version)
echo "Node.js: $NODE_VER"

echo
echo "Installing dependencies (npm install)..."
npm install

echo
echo "================================================"
echo "  Done! Run: npm run dev"
echo "================================================"
