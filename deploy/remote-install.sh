#!/usr/bin/env bash
#
# Runs ON the server. Not meant to be invoked by hand -- deploy.sh uploads a
# payload and then runs this.
#
# Scope discipline: this touches only the paths listed below and adds exactly
# one ufw rule. It never stops, reconfigures or removes anything else on the
# box, and it verifies at the end that the pre-existing services are still up.
#
#   /opt/match-monsters          application + private Node runtime
#   /var/lib/match-monsters      match state (the only writable path)
#   /etc/match-monsters.env      configuration, created once
#   /etc/systemd/system/match-monsters.service
#
set -euo pipefail

SERVICE=match-monsters
SVC_USER=${MM_SVC_USER:-mmonsters}
PREFIX=${MM_PREFIX:-/opt/match-monsters}
DATADIR=${MM_DATADIR:-/var/lib/match-monsters}
ENVFILE=${MM_ENVFILE:-/etc/match-monsters.env}
PORT=${MM_PORT:-8080}
PLAYER1=${MM_PLAYER1:-Player One}
PLAYER2=${MM_PLAYER2:-Player Two}
PAYLOAD=${MM_PAYLOAD:-/tmp/match-monsters-payload}
NODE_VERSION=${MM_NODE_VERSION:-v22.12.0}
OPEN_FIREWALL=${MM_OPEN_FIREWALL:-1}

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Record what else is running, so we can prove we did not disturb it.
# ---------------------------------------------------------------------------

say "Noting existing services (these must not change)"
BEFORE=$(systemctl is-active ollama hermes-bot 2>/dev/null | tr '\n' ' ' || true)
info "ollama / hermes-bot: ${BEFORE:-not present}"

# ---------------------------------------------------------------------------
# Service account
# ---------------------------------------------------------------------------

say "Service account"
if id -u "$SVC_USER" >/dev/null 2>&1; then
  info "user $SVC_USER already exists"
else
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
  info "created system user $SVC_USER (no login shell)"
fi

# ---------------------------------------------------------------------------
# Node runtime
# ---------------------------------------------------------------------------

say "Node runtime"
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  HAVE=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "$HAVE" -ge 20 ] 2>/dev/null; then
    NODE_BIN=$(command -v node)
    info "using the system Node $(node -v) at $NODE_BIN"
  else
    info "system Node is v$HAVE, too old"
  fi
fi

if [ -z "$NODE_BIN" ]; then
  if [ -x "$PREFIX/runtime/bin/node" ]; then
    NODE_BIN="$PREFIX/runtime/bin/node"
    info "using the previously installed private runtime ($("$NODE_BIN" -v))"
  else
    case "$(uname -m)" in
      x86_64) ARCH=x64 ;;
      aarch64 | arm64) ARCH=arm64 ;;
      *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
    esac

    TARBALL="node-${NODE_VERSION}-linux-${ARCH}.tar.xz"
    info "downloading $TARBALL (private to this app, nothing system-wide)"
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT

    curl -fsSL -o "$TMP/$TARBALL" "https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}"
    curl -fsSL -o "$TMP/SHASUMS256.txt" "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"

    ( cd "$TMP" && grep " $TARBALL\$" SHASUMS256.txt | sha256sum -c - )
    info "checksum verified"

    sudo mkdir -p "$PREFIX/runtime"
    sudo tar -xJf "$TMP/$TARBALL" -C "$PREFIX/runtime" --strip-components=1
    NODE_BIN="$PREFIX/runtime/bin/node"
    info "installed $("$NODE_BIN" -v) to $PREFIX/runtime"
  fi
fi

# ---------------------------------------------------------------------------
# Application files
# ---------------------------------------------------------------------------

say "Application files"
[ -f "$PAYLOAD/server.js" ] || { echo "Payload missing at $PAYLOAD" >&2; exit 1; }

sudo mkdir -p "$PREFIX" "$DATADIR"
sudo rm -rf "$PREFIX/public"
sudo cp -r "$PAYLOAD/public" "$PREFIX/public"
sudo cp "$PAYLOAD/server.js" "$PREFIX/server.js"

sudo chown -R root:root "$PREFIX"
sudo chown -R "$SVC_USER:$SVC_USER" "$DATADIR"
sudo chmod 750 "$DATADIR"
info "installed to $PREFIX, state directory $DATADIR"

# ---------------------------------------------------------------------------
# Configuration (written once, so re-deploys keep your settings)
# ---------------------------------------------------------------------------

say "Configuration"
if [ -f "$ENVFILE" ]; then
  info "$ENVFILE already exists, leaving it alone"
else
  sudo tee "$ENVFILE" >/dev/null <<EOF
MM_PORT=$PORT
MM_HOST=0.0.0.0
MM_STATE=$DATADIR/state.json
MM_STATIC=$PREFIX/public
MM_PLAYER1=$PLAYER1
MM_PLAYER2=$PLAYER2
# Set to 1 when a TLS terminator (Caddy, nginx) sits in front, so the session
# cookie is issued with the Secure attribute.
MM_BEHIND_TLS=0
EOF
  sudo chmod 640 "$ENVFILE"
  sudo chown root:"$SVC_USER" "$ENVFILE"
  info "wrote $ENVFILE"
fi

# ---------------------------------------------------------------------------
# systemd unit
# ---------------------------------------------------------------------------

say "systemd unit"
sudo sed \
  -e "s|__USER__|$SVC_USER|g" \
  -e "s|__PREFIX__|$PREFIX|g" \
  -e "s|__NODE__|$NODE_BIN|g" \
  -e "s|__ENVFILE__|$ENVFILE|g" \
  -e "s|__DATADIR__|$DATADIR|g" \
  "$PAYLOAD/match-monsters.service" | sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null 2>&1 || true

FIRST_RUN=0
[ -f "$DATADIR/state.json" ] || FIRST_RUN=1

sudo systemctl restart "$SERVICE"
info "service restarted"

# ---------------------------------------------------------------------------
# Firewall (add one rule; never reset or change defaults)
# ---------------------------------------------------------------------------

if [ "$OPEN_FIREWALL" = "1" ] && command -v ufw >/dev/null 2>&1; then
  say "Firewall"
  if sudo ufw status | grep -qE "^${PORT}(/tcp)?[[:space:]]+ALLOW"; then
    info "ufw already allows $PORT"
  else
    sudo ufw allow "$PORT/tcp" >/dev/null
    info "added ufw rule: allow $PORT/tcp"
  fi
fi

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

say "Health check"
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    info "responding on 127.0.0.1:$PORT"
    break
  fi
  [ "$i" = 20 ] && { echo "Service did not come up. Recent log:" >&2; sudo journalctl -u "$SERVICE" -n 40 --no-pager >&2; exit 1; }
  sleep 1
done

say "Confirming nothing else was disturbed"
AFTER=$(systemctl is-active ollama hermes-bot 2>/dev/null | tr '\n' ' ' || true)
info "ollama / hermes-bot: ${AFTER:-not present}"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "WARNING: the state of the pre-existing services changed ($BEFORE -> $AFTER)." >&2
else
  info "unchanged"
fi

if [ "$FIRST_RUN" = "1" ] || grep -q '^MM_RESET_PASSPHRASES=1' "$ENVFILE" 2>/dev/null; then
  say "Account passphrases (shown once)"
  sudo journalctl -u "$SERVICE" --no-pager | grep -A 6 -E "accounts created|passphrases reset" | tail -n 5 || \
    info "Could not read them from the journal; run: sudo journalctl -u $SERVICE | grep -A6 'accounts created'"
fi

say "Done"
info "Service:  sudo systemctl status $SERVICE"
info "Logs:     sudo journalctl -u $SERVICE -f"

# Tidy up the upload. Guarded rather than a bare rm -rf on a variable: only a
# directory under /tmp that actually looks like our payload is removed.
case "$PAYLOAD" in
  /tmp/*) [ -f "$PAYLOAD/server.js" ] && rm -rf "$PAYLOAD" ;;
esac
