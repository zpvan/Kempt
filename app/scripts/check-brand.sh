#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

grep -q '"productName": "Kempt"' "$APP_DIR/src-tauri/tauri.conf.json"
grep -q 'name = "kempt-server"' "$APP_DIR/crates/server/Cargo.toml"
grep -q '^name = "kempt"$' "$APP_DIR/src-tauri/Cargo.toml"
grep -q '"name": "kempt"' "$APP_DIR/package.json"
grep -q 'name = "kempt_lib"' "$APP_DIR/src-tauri/Cargo.toml"
printf 'Kempt brand configuration is valid\n'
