#!/bin/bash

# Slack Claude Bot 起動スクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# .envファイルの存在確認
if [ ! -f ".env" ]; then
    echo "Error: .env file not found"
    echo "Please copy .env.example to .env and set SLACK_BOT_TOKEN"
    exit 1
fi

# node_modulesの存在確認
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# 起動
echo "Starting Slack Claude Bot..."
npm start
