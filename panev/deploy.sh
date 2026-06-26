#!/usr/bin/env bash
# One-line deploy helper — просто стартира scripts/deploy.sh от корена.
# Usage:  bash deploy.sh
exec "$(dirname "$0")/scripts/deploy.sh" "$@"
