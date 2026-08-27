# Match Monsters

A private, two-player shared-board match-3 monster battler.

Currently at **P1**: playable online from two devices, with an authoritative
server, or hot-seat on one device.

See [`docs/plan.html`](docs/plan.html) for the feasibility read and build plan,
[`deploy/README.md`](deploy/README.md) for the deployment runbook, and
[`docs/art-prompts.md`](docs/art-prompts.md) for the sprite prompts.

## Running it locally

```sh
pnpm install
pnpm dev          # client on http://localhost:5173
pnpm dev:server   # server on http://localhost:8080, prints two passphrases
```

The client proxies `/api` and `/socket` to the server in development. To play
hot-seat you do not need the server at all — there is a link on the sign-in
screen.

```sh
pnpm test         # engine test suite
pnpm typecheck    # all packages
```

## Deploying

```sh
./deploy/deploy.sh -i <ssh-key> -1 "Name" -2 "Name"
```

Additive by design: a dedicated system user, its own directory, one systemd
unit, one firewall rule, and nothing else on the box touched. See
[`deploy/README.md`](deploy/README.md).

## Layout

| Path | What it is |
|------|-----------|
| `packages/engine` | Pure game logic. No I/O, no network, no framework. |
| `packages/shared` | Wire protocol shared by client and server. |
| `apps/server` | Authoritative server. Bundles to one dependency-free JS file. |
| `apps/web` | React client. Renders the engine's event stream. |
| `tools/sprites` | Art prompts and the optional sprite-processing script. |
| `deploy` | Deploy kit and runbook. |
| `docs` | Plan and art documentation. |

## How multiplayer works

The server holds the only real match state and runs the engine itself. Clients
send an intent (`{ t: "move", ... }`) and receive the resulting event stream,
which every connected client animates. The server validates whose turn it is, so
a tampered client can do nothing but get its move rejected.

State is a single JSON file written atomically — with two players and one match
in flight, that is genuinely enough, and it keeps the deployment free of native
modules and migrations. A match survives `SIGKILL`: board, RNG cursor, sessions
and all.

Authentication is two passphrases generated at install and a signed cookie. No
registration, no email, no reset flow.

## How the engine works

The entire surface is one function:

```ts
applyMove(state, move) -> { state, events }
```

`events` is an animation script — tiles matched, tiles fell, mana gained,
ability fired, damage dealt. The client never computes game state; it plays the
events back. That decoupling means a rendering bug cannot desynchronise a
match, which is the failure mode that makes homebrew multiplayer miserable.

Randomness lives inside the state as a seed plus a counter, so a whole match
replays exactly from its seed and move log. A bug report is a match id.

Monster abilities are **data**, not code:

```ts
{ id: "bonzumi", element: "fire", mana: 8,
  effects: [{ k: "damage", n: 20 }, { k: "clearColumn", n: 1 }] }
```

Around twenty-six effect primitives plus five lifecycle hooks and per-monster
counters cover the whole documented roster, so adding a monster is a config
entry rather than a code change.

## Rulings the source document left open

The design document this is based on is incomplete, so these were decided here
and are all worth revisiting during balancing:

- **Cascades are depth-capped at 20.** Converter monsters such as Pelijet can
  feed themselves indefinitely otherwise.
- **Ability-created matches pay mana but not moves.** The documented Pelijet
  loop depends on the mana; refunding moves as well lets one turn run away.
- **Bonus tiers read the longest single run** in a match group, while mana
  reads the whole group, so an L-shape pays five mana but scores as a three.
- **Ability clears award no mana directly.** The value is in the cascade they
  set up, which scores normally.
- **A player never drops below one move**, so stacked penalties cannot deadlock.
- **A status never ticks on the turn it was applied**, so "lose a move next
  turn" costs the next turn rather than the current one.
- **Berry weight is 0.7.** Measured over 60 seeded playthroughs: the first
  evolution lands around turn 6.5 of a ~26-turn game. At 0.4 it slipped to turn
  11.5, which left evolved forms almost no play time.

## Not built yet

Draft mode with elemental ban lockout, stage selection, push notifications, the
exotic monsters that need lifecycle hooks (Gargice, Cactkid, Kittea, Voltshard,
Petirex, Echomori, Abyssoul, Aromaphant), and the roughly twenty roster slots
the source document never specified.

Traffic is currently plain HTTP. `deploy/README.md` has the HTTPS upgrade, which
also unblocks installing the game to a phone home screen and push notifications.
