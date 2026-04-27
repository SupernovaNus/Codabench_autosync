#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NODE_BIN="${NODE_BIN:-}"

if [[ -z "${NODE_BIN}" ]]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  else
    for candidate in "${HOME}"/.cache/codex-runtimes/*/dependencies/node/bin/node; do
      if [[ -x "${candidate}" ]]; then
        NODE_BIN="${candidate}"
        break
      fi
    done
  fi
fi

if [[ -z "${NODE_BIN}" || ! -x "${NODE_BIN}" ]]; then
  echo "Could not find a Node.js executable. Set NODE_BIN=/path/to/node and try again." >&2
  exit 127
fi

if [[ -z "${PLAYWRIGHT_NODE_MODULES:-}" ]]; then
  if [[ -d "${PROJECT_ROOT}/node_modules/playwright" ]]; then
    export PLAYWRIGHT_NODE_MODULES="${PROJECT_ROOT}/node_modules"
  else
    for candidate in "${HOME}"/.cache/codex-runtimes/*/dependencies/node/node_modules; do
      if [[ -d "${candidate}/playwright" ]]; then
        export PLAYWRIGHT_NODE_MODULES="${candidate}"
        break
      fi
    done
  fi
fi

cd "${PROJECT_ROOT}"
exec "${NODE_BIN}" scripts/run-codabench-sync.cjs "$@"
