#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
npm run build:ui
cargo build --release -p kempt-server
if [[ "$(uname -s)" == "Darwin" ]]; then
  npm run tauri build -- --bundles app
else
  npm run tauri build
fi

size_bytes() {
  if [[ "$(uname -s)" == "Darwin" ]]; then stat -f%z "$1"; else stat -c%s "$1"; fi
}

report() {
  local path="$1"
  local bytes
  bytes="$(size_bytes "$path")"
  awk -v name="$path" -v bytes="$bytes" 'BEGIN { printf "%s: %d bytes (%.2f MiB)\n", name, bytes, bytes / 1048576 }'
}

report "$APP_DIR/target/release/kempt-server"
report "$APP_DIR/target/release/kempt"
if [[ "$(uname -s)" == "Darwin" ]]; then
  du -sm "$APP_DIR/target/release/bundle/macos/Kempt.app"
fi
