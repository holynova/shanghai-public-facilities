#!/usr/bin/env zsh
set -euo pipefail

PROJECT_ROOT="/Users/sym/Code/shanghai_public_facilities"
ENV_FILE="${PROJECT_ROOT}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  source "${ENV_FILE}"
  set +a
fi

if [[ -z "${AMAP_MCP_KEY:-}" ]]; then
  print -u2 "AMAP_MCP_KEY is missing. Set it in ${ENV_FILE} before starting the Amap MCP server."
  exit 3
fi

export AMAP_MAPS_API_KEY="${AMAP_MCP_KEY}"
exec npx -y @amap/amap-maps-mcp-server
