#!/usr/bin/env bash
#
# Deploy Match Monsters to the server. Run this from your own machine, from the
# repository root or from deploy/.
#
#   ./deploy/deploy.sh -i ~/keys/ssh-key-2026-06-11.key
#
# Options:
#   -i <keyfile>   SSH private key                    (required)
#   -h <host>      user@host                          (default ubuntu@150.136.149.33)
#   -p <port>      port the game listens on           (default 8080)
#   -1 <name>      display name for player one        (default "Player One")
#   -2 <name>      display name for player two        (default "Player Two")
#   --no-firewall  skip the ufw rule
#   --dry-run      build and show what would happen, change nothing remotely
#
# This adds one service and one firewall rule. It does not stop, reconfigure or
# remove anything already on the box.
#
set -euo pipefail

HOST=ubuntu@150.136.149.33
KEY=""
PORT=8080
PLAYER1="Player One"
PLAYER2="Player Two"
OPEN_FIREWALL=1
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    -i) KEY=$2; shift 2 ;;
    -h) HOST=$2; shift 2 ;;
    -p) PORT=$2; shift 2 ;;
    -1) PLAYER1=$2; shift 2 ;;
    -2) PLAYER2=$2; shift 2 ;;
    --no-firewall) OPEN_FIREWALL=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "Unknown option: $1" >&2; sed -n '3,20p' "$0" >&2; exit 1 ;;
  esac
done

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }

[ -n "$KEY" ] || { echo "A key is required: -i <keyfile>" >&2; exit 1; }
[ -f "$KEY" ] || { echo "No such key file: $KEY" >&2; exit 1; }

# OpenSSH refuses a key other people can read.
PERMS=$(stat -c '%a' "$KEY" 2>/dev/null || stat -f '%Lp' "$KEY" 2>/dev/null || echo "")
if [ -n "$PERMS" ] && [ "$PERMS" != "600" ] && [ "$PERMS" != "400" ]; then
  info "tightening permissions on $KEY (was $PERMS)"
  chmod 600 "$KEY"
fi

# ---------------------------------------------------------------------------
# Build locally, so the server never needs a toolchain or node_modules
# ---------------------------------------------------------------------------

say "Building"
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required to build. https://pnpm.io/installation" >&2; exit 1; }

pnpm install --frozen-lockfile
pnpm --filter @mm/engine test
pnpm --filter @mm/web build
pnpm --filter @mm/server build

[ -f apps/server/dist/server.js ] || { echo "Server bundle missing" >&2; exit 1; }
[ -f apps/web/dist/index.html ] || { echo "Web build missing" >&2; exit 1; }

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/payload"
cp apps/server/dist/server.js "$STAGE/payload/server.js"
cp -r apps/web/dist "$STAGE/payload/public"
cp deploy/match-monsters.service "$STAGE/payload/"
cp deploy/remote-install.sh "$STAGE/payload/"

tar -czf "$STAGE/payload.tar.gz" -C "$STAGE" payload
SIZE=$(du -h "$STAGE/payload.tar.gz" | cut -f1)
info "payload is $SIZE (a single JS file plus static assets, no node_modules)"

if [ "$DRY_RUN" = "1" ]; then
  say "Dry run — stopping before touching the server"
  info "would upload   $STAGE/payload.tar.gz -> $HOST:/tmp/"
  info "would install  /opt/match-monsters, /var/lib/match-monsters"
  info "would create   systemd unit match-monsters, listening on $PORT"
  [ "$OPEN_FIREWALL" = "1" ] && info "would add      ufw allow $PORT/tcp"
  info "would not touch ollama, hermes-bot, or any other unit"
  exit 0
fi

# ---------------------------------------------------------------------------
# Upload and install
# ---------------------------------------------------------------------------

SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

say "Uploading to $HOST"
scp "${SSH_OPTS[@]}" -q "$STAGE/payload.tar.gz" "$HOST:/tmp/match-monsters-payload.tar.gz"
info "uploaded"

say "Installing"
# shellcheck disable=SC2029  # the variables are meant to expand locally
ssh "${SSH_OPTS[@]}" "$HOST" "
  set -euo pipefail
  rm -rf /tmp/match-monsters-payload
  mkdir -p /tmp/match-monsters-payload
  tar -xzf /tmp/match-monsters-payload.tar.gz -C /tmp/match-monsters-payload --strip-components=1
  rm -f /tmp/match-monsters-payload.tar.gz
  chmod +x /tmp/match-monsters-payload/remote-install.sh
  MM_PORT='$PORT' \
  MM_PLAYER1='$PLAYER1' \
  MM_PLAYER2='$PLAYER2' \
  MM_OPEN_FIREWALL='$OPEN_FIREWALL' \
  MM_PAYLOAD=/tmp/match-monsters-payload \
  bash /tmp/match-monsters-payload/remote-install.sh
"

REMOTE_HOST=${HOST#*@}
say "Deployed"
info "Open  http://$REMOTE_HOST:$PORT"
echo
info "If it does not load from outside the box, the port is still closed in the"
info "OCI console. Add an ingress rule for TCP $PORT to the instance's Security"
info "List or NSG -- that part cannot be done over SSH."
echo
info "Traffic is plain HTTP, so passphrases and session cookies cross the"
info "network unencrypted. See deploy/README.md for the HTTPS upgrade."
