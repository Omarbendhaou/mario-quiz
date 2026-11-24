#!/usr/bin/env bash
echo "======================================================================"
echo "   🍄 SUPER MARIO CLASSROOM QUIZ - CHAPTER 8: CLOSING PROJECTS 🍄"
echo "======================================================================"
echo ""

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed. Please install Node.js (v16+) from https://nodejs.org/"
    exit 1
fi

echo "Node.js detected: $(node -v)"

if [ ! -d "node_modules" ]; then
    echo "[Setup] Installing dependencies..."
    npm install
fi

echo "Starting server on http://localhost:3000 ..."
echo "- Host Projector View: http://localhost:3000/host (PIN: 1234)"
echo "- Player View: http://localhost:3000"

if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3000/host" &
elif command -v open &> /dev/null; then
    open "http://localhost:3000/host" &
fi

node server.js
