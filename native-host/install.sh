#!/usr/bin/env bash
# Generates run.sh and registers the native messaging host in every
# Chromium-family browser found on this machine.
set -euo pipefail

HOST_NAME="com.claude_slack_review.host"
EXT_ID="mnjmjomadajemdflfgeeaggadoobokdn"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NODE_BIN="$(command -v node || true)"
CLAUDE_BIN="$(command -v claude || true)"
if [ -z "$NODE_BIN" ]; then
  echo "Erro: node não encontrado. Instale o Node 18 ou superior (https://nodejs.org) e rode de novo." >&2
  exit 1
fi
if [ -z "$CLAUDE_BIN" ]; then
  echo "Erro: claude não encontrado. Instale o Claude Code e rode 'claude' uma vez para fazer login; depois rode este script de novo." >&2
  exit 1
fi
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Erro: Node $NODE_MAJOR encontrado em $NODE_BIN; é preciso Node 18 ou superior." >&2
  exit 1
fi

cat > "$DIR/run.sh" <<RUN
#!/usr/bin/env bash
export PATH="$(dirname "$NODE_BIN"):$(dirname "$CLAUDE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export CLAUDE_BIN="$CLAUDE_BIN"
# claude reads its login from the keychain, which needs the user name
export USER="\${USER:-\$(id -un)}"
export LOGNAME="\${LOGNAME:-\$USER}"
exec "$NODE_BIN" "$DIR/host.js"
RUN
chmod +x "$DIR/run.sh" "$DIR/host.js"

# "<app support dir>|<NativeMessagingHosts parent>" per browser
if [ "$(uname)" = "Darwin" ]; then
  B="$HOME/Library/Application Support"
  DIRS=(
    "$B/Google/Chrome"
    "$B/Google/Chrome Beta"
    "$B/Chromium"
    "$B/BraveSoftware/Brave-Browser"
    "$B/Microsoft Edge"
    "$B/Arc/User Data"
  )
else
  B="$HOME/.config"
  DIRS=(
    "$B/google-chrome"
    "$B/chromium"
    "$B/BraveSoftware/Brave-Browser"
    "$B/microsoft-edge"
  )
fi

INSTALLED=0
for i in "${!DIRS[@]}"; do
  base="${DIRS[$i]}"
  # Chrome (first entry) is always installed; the others only if present
  if [ "$i" -ne 0 ] && [ ! -d "$base" ]; then continue; fi
  target="$base/NativeMessagingHosts"
  mkdir -p "$target"
  cat > "$target/$HOST_NAME.json" <<JSON
{
  "name": "$HOST_NAME",
  "description": "Revisor de mensagens do Slack (Claude Code local)",
  "path": "$DIR/run.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
JSON
  echo "Registrado em: $target/$HOST_NAME.json"
  INSTALLED=$((INSTALLED + 1))
done

echo
echo "Pronto ($INSTALLED navegador(es)). node: $NODE_BIN | claude: $CLAUDE_BIN"

# The updater re-runs this script quietly; skip the interactive steps then
if [ -n "${SLACK_REVIEW_QUIET:-}" ]; then exit 0; fi

EXT_DIR="$(dirname "$DIR")/extension"
echo
echo "Falta carregar a extensão no navegador:"
echo "  1. Ative o Modo do desenvolvedor (canto superior direito de chrome://extensions)."
echo "  2. Clique em Carregar sem compactação. Vai abrir uma janela para escolher a pasta."
if [ "$(uname)" = "Darwin" ]; then
  echo "  3. Nessa janela, aperte ⌘ + Shift + G, cole o caminho abaixo com ⌘V, aperte Enter e clique em Selecionar:"
else
  echo "  3. Nessa janela, aperte Ctrl + L, cole o caminho abaixo, aperte Enter e confirme:"
fi
echo
echo "     $EXT_DIR"
echo
if command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$EXT_DIR" | pbcopy && echo "(caminho copiado para a área de transferência)"
fi
if [ "$(uname)" = "Darwin" ]; then
  open -a "Google Chrome" "chrome://extensions" >/dev/null 2>&1 || true
fi
