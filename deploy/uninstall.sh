#!/usr/bin/env bash
#
# Removes Match Monsters from the server, leaving everything else untouched.
# Run on your own machine:
#
#   ./deploy/uninstall.sh -i ~/keys/ssh-key-2026-06-11.key            # keep saved matches
#   ./deploy/uninstall.sh -i ~/keys/ssh-key-2026-06-11.key --purge    # delete them too
#
set -euo pipefail

HOST=ubuntu@150.136.149.33
KEY=""
PORT=8080
PURGE=0

while [ $# -gt 0 ]; do
  case "$1" in
    -i) KEY=$2; shift 2 ;;
    -h) HOST=$2; shift 2 ;;
    -p) PORT=$2; shift 2 ;;
    --purge) PURGE=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

[ -n "$KEY" ] || { echo "A key is required: -i <keyfile>" >&2; exit 1; }

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "
  set -euo pipefail
  echo '==> Stopping the service'
  sudo systemctl disable --now match-monsters 2>/dev/null || true
  sudo rm -f /etc/systemd/system/match-monsters.service
  sudo systemctl daemon-reload

  echo '==> Removing application files'
  sudo rm -rf /opt/match-monsters
  sudo rm -f /etc/match-monsters.env

  if [ '$PURGE' = '1' ]; then
    echo '==> Removing saved matches and accounts'
    sudo rm -rf /var/lib/match-monsters
    sudo userdel mmonsters 2>/dev/null || true
  else
    echo '==> Keeping /var/lib/match-monsters (use --purge to delete)'
  fi

  if command -v ufw >/dev/null 2>&1; then
    echo '==> Removing the firewall rule'
    sudo ufw delete allow '$PORT'/tcp 2>/dev/null || true
  fi

  echo '==> Other services, untouched:'
  systemctl is-active ollama hermes-bot 2>/dev/null || true
  echo '==> Done'
"
