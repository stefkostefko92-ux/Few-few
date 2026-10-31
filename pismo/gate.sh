#!/usr/bin/env bash
# Pismo quality gate: build check + tests. Needs Python 3.11+ with requirements.txt installed.
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
"$PY" -m unittest discover -s tests -v
