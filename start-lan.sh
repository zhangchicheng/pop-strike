#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if command -v node >/dev/null 2>&1; then
  exec node pop-strike/server.mjs
fi
# This workstation has VS Code's Node runtime even when node/npm are absent.
for runtime in /usr/share/code/code /opt/visual-studio-code/code /usr/lib/code/code; do
  if [[ -x "$runtime" ]]; then
    exec env ELECTRON_RUN_AS_NODE=1 "$runtime" pop-strike/server.mjs
  fi
done
printf '%s\n' '未找到 Node.js。请安装 Node.js 18 或更新版本，然后重新执行 bash start-lan.sh。' >&2
exit 1
