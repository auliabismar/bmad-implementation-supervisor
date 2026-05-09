#!/bin/bash
# Install script for Linux/macOS
set -e

echo "Installing BMAD Implementation Supervisor..."

if ! command -v bun &> /dev/null; then
    echo "Error: Bun is not installed. Install from https://bun.sh"
    exit 1
fi

echo "Installing dependencies..."
bun install

echo "Running TypeScript type check..."
bun run typecheck

echo "Installation complete!"