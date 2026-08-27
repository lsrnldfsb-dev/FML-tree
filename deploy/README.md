# Deploying to the server

One command, from your own machine:

```sh
./deploy/deploy.sh -i ~/path/to/ssh-key-2026-06-11.key -1 "Your name" -2 "Her name"
```

Then open `http://150.136.149.33:8080` and sign in with the passphrases the
script prints at the end. They are shown **once**.

Try `--dry-run` first if you want to see what it would do without touching the
server.

---

## What this adds to the box, and what it leaves alone

The server already runs Ollama and the `hermes-bot` Telegram bridge. This
deployment is entirely additive and never stops, reconfigures, or removes
anything that was already there.

**Created:**

| Path | Purpose |
|------|---------|
| `/opt/match-monsters` | The app: one JS file plus static assets |
| `/var/lib/match-monsters` | Match state — the only writable path |
| `/etc/match-monsters.env` | Configuration, written once |
| `/etc/systemd/system/match-monsters.service` | The unit |
| system user `mmonsters` | No login shell, owns nothing but the data dir |
| one `ufw allow 8080/tcp` rule | Nothing else in the firewall is changed |

**Deliberately not done:** no `apt install`, no new apt repositories, no changes
to `ufw` defaults or existing rules, no touching `ollama.service` or
`hermes-bot.service`. The installer records whether those two are running before
it starts and re-checks afterwards, and warns if the state changed.

If the box has no Node 20+, the installer downloads the official Node tarball
into `/opt/match-monsters/runtime` and verifies its checksum — private to this
app, nothing system-wide. If a suitable Node already exists it uses that.

The service is sandboxed by systemd: `ProtectSystem=strict`, `ProtectHome`,
`NoNewPrivileges`, a 400 MB memory cap so it can't crowd out Ollama, and exactly
one writable path.

---

## The one step that cannot be scripted

Oracle Cloud has its own firewall in the web console, separate from `ufw`. The
installer opens the port in `ufw`; **you must also add an ingress rule in the
OCI console** or the game will be reachable only from the box itself.

1. OCI console → Compute → Instances → your instance
2. Click the subnet under "Primary VNIC"
3. Security Lists → the default list → **Add Ingress Rule**
4. Source `0.0.0.0/0`, IP Protocol TCP, Destination Port Range `8080`

Quick way to tell which firewall is blocking you: if
`curl http://127.0.0.1:8080/api/health` works when SSH'd into the box but the
site does not load from your laptop, the OCI rule is missing.

---

## Security, honestly

**Traffic is plain HTTP.** Passphrases and session cookies cross the network
unencrypted, and anyone on the same network path could read them. For two people
playing a private game this is a real but modest risk. It also means phones will
not offer to install the page as an app, and browser push notifications will not
work later — both require HTTPS.

The upgrade needs no domain purchase. `sslip.io` resolves any IP-shaped hostname
to that IP, so `150-136-149-33.sslip.io` already points at the box, and Caddy can
get a real Let's Encrypt certificate for it:

```sh
# on the box
sudo apt install -y caddy
echo '150-136-149-33.sslip.io { reverse_proxy 127.0.0.1:8080 }' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo sed -i 's/^MM_BEHIND_TLS=0/MM_BEHIND_TLS=1/' /etc/match-monsters.env
sudo systemctl restart match-monsters
```

That needs ports 80 and 443 open in both `ufw` and the OCI console. This does
install a package, so it is left as a deliberate choice rather than done for you.
Say the word and I will script it properly.

**Two things from the handoff document are worth acting on independently of this
deployment.** The Telegram bot token is written in plaintext in a
`.claude/settings.json` and should be considered exposed — rotate it via
BotFather unless you still need that exact bot. And the SSH private key is
committed inside a repository, which means anyone who gets a copy of that repo
has full access to this server. Generating a separate key per user, and removing
that one from version control, would be worth an hour of your time.

---

## Day to day

```sh
sudo systemctl status match-monsters       # is it up
sudo journalctl -u match-monsters -f       # live logs
sudo systemctl restart match-monsters      # restart
```

**Redeploying** after changes is the same command as the first time. It is
idempotent: your config and all saved matches survive, and passphrases are not
reissued.

**Backing up** is copying one file:

```sh
scp -i <key> ubuntu@150.136.149.33:/var/lib/match-monsters/state.json ./backup.json
```

That file holds the accounts, the match in progress, and the history.

**Lost a passphrase?** You do not have to wipe anything:

```sh
sudo sed -i '$a MM_RESET_PASSPHRASES=1' /etc/match-monsters.env
sudo systemctl restart match-monsters
sudo journalctl -u match-monsters -n 20 --no-pager   # read the new ones
sudo sed -i '/MM_RESET_PASSPHRASES=1/d' /etc/match-monsters.env
```

Both passphrases are reissued and everyone is signed out. Match history is kept.

**Changing display names** — edit `MM_PLAYER1` / `MM_PLAYER2` in
`/etc/match-monsters.env` and restart. Names are cosmetic; passphrases are
unaffected.

---

## Removing it

```sh
./deploy/uninstall.sh -i ~/path/to/ssh-key-2026-06-11.key           # keep saved matches
./deploy/uninstall.sh -i ~/path/to/ssh-key-2026-06-11.key --purge   # delete everything
```

Stops and removes the service, the app directory, the config, and the firewall
rule, and reports that Ollama and `hermes-bot` are still running. `--purge` also
removes the data directory and the service user.

---

## If something goes wrong

| Symptom | Cause |
|---------|-------|
| Script stops at "Service did not come up" | It prints the last 40 log lines. Usually the port is already in use — pick another with `-p`. |
| Works via SSH on the box, not from outside | The OCI ingress rule is missing. See above. |
| "That passphrase does not match" | They are case-sensitive and hyphenated exactly as printed. Reset them with the recipe above. |
| Page loads but says "Reconnecting…" | The WebSocket is not getting through. If you put a proxy in front, it must forward `/socket` with upgrade headers. |
| Both players see "waiting for the other to pick" | Someone submitted a team then cleared it. Both need to lock in again. |
