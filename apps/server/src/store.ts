import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MatchState, PlayerIndex } from "@mm/engine";
import type { HistoryEntry } from "@mm/shared";

/**
 * Persistence.
 *
 * A JSON file rather than a database. With exactly two players and one match in
 * flight, a single-writer file store with atomic replace is genuinely enough,
 * and it keeps the deployment free of native modules and migrations. Everything
 * goes through this interface so swapping in SQLite later is a contained change.
 */

export interface StoredUser {
  name: string;
  /** scrypt hash of the passphrase, as "salt:derived" in hex. */
  passHash: string;
}

export interface PersistedState {
  version: number;
  /** HMAC key for session cookies. Rotating it logs both players out. */
  sessionSecret: string;
  users: [StoredUser, StoredUser];
  teams: [([string, string] | null), ([string, string] | null)];
  matchId: string | null;
  match: MatchState | null;
  history: HistoryEntry[];
  /** Who took the first turn last time, so it can alternate. */
  lastFirst: PlayerIndex;
}

const CURRENT_VERSION = 1;

export class Store {
  private state: PersistedState;
  private writeQueued = false;

  constructor(
    private readonly path: string,
    seed: () => PersistedState,
  ) {
    mkdirSync(dirname(path), { recursive: true });

    if (existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, "utf8")) as PersistedState;
      if (raw.version !== CURRENT_VERSION) {
        throw new Error(
          `State file at ${path} is version ${raw.version}, this build expects ${CURRENT_VERSION}.`,
        );
      }
      this.state = raw;
    } else {
      this.state = seed();
      this.flush();
    }
  }

  get data(): PersistedState {
    return this.state;
  }

  /**
   * Marks the state dirty. Writes are coalesced to the end of the current tick
   * so a move that mutates several fields still costs one disk write.
   */
  save(): void {
    if (this.writeQueued) return;
    this.writeQueued = true;
    queueMicrotask(() => {
      this.writeQueued = false;
      this.flush();
    });
  }

  /** Write to a sibling temp file then rename, so a crash cannot truncate. */
  private flush(): void {
    const tmp = join(dirname(this.path), `.${Date.now()}.tmp`);
    writeFileSync(tmp, JSON.stringify(this.state), "utf8");
    renameSync(tmp, this.path);
  }

  /** Forces a synchronous write, for shutdown. */
  flushNow(): void {
    this.flush();
  }
}

export function emptyState(
  sessionSecret: string,
  users: [StoredUser, StoredUser],
): PersistedState {
  return {
    version: CURRENT_VERSION,
    sessionSecret,
    users,
    teams: [null, null],
    matchId: null,
    match: null,
    history: [],
    lastFirst: 1,
  };
}
