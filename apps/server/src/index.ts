import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import type { PlayerIndex } from "@mm/engine";
import type { ClientMessage, LoginResponse, ServerMessage } from "@mm/shared";
import {
  COOKIE_NAME,
  generatePassphrase,
  hashPassphrase,
  issueSession,
  parseCookies,
  readSession,
  sessionCookie,
  verifyPassphrase,
} from "./auth.js";
import { Game, type Connection } from "./game.js";
import { emptyState, Store, type StoredUser } from "./store.js";

const PORT = Number(process.env.MM_PORT ?? 8080);
const HOST = process.env.MM_HOST ?? "0.0.0.0";
const STATE_PATH = process.env.MM_STATE ?? "./data/state.json";
const STATIC_DIR = resolve(process.env.MM_STATIC ?? "./public");
/** Set when a TLS terminator sits in front, so the session cookie gets Secure. */
const BEHIND_TLS = process.env.MM_BEHIND_TLS === "1";
const NAMES: [string, string] = [
  process.env.MM_PLAYER1 ?? "Player One",
  process.env.MM_PLAYER2 ?? "Player Two",
];
/** Set for one boot to reissue both passphrases without losing match history. */
const RESET_PASSPHRASES = process.env.MM_RESET_PASSPHRASES === "1";

// ---------------------------------------------------------------------------
// First run: generate credentials and print them once
// ---------------------------------------------------------------------------

const generated: string[] = [];

const store = new Store(STATE_PATH, () => {
  const users = NAMES.map<StoredUser>((name) => {
    const passphrase = generatePassphrase();
    generated.push(`  ${name}: ${passphrase}`);
    return { name, passHash: hashPassphrase(passphrase) };
  }) as [StoredUser, StoredUser];

  return emptyState(randomBytes(32).toString("hex"), users);
});

if (generated.length === 0 && RESET_PASSPHRASES) {
  // Recovery path for a lost passphrase that keeps saved matches intact.
  for (const index of [0, 1] as PlayerIndex[]) {
    const passphrase = generatePassphrase();
    store.data.users[index].passHash = hashPassphrase(passphrase);
    generated.push(`  ${store.data.users[index].name}: ${passphrase}`);
  }
  // Rotating the secret signs everyone out, which is what a credential reset
  // should do.
  store.data.sessionSecret = randomBytes(32).toString("hex");
  store.flushNow();
}

if (generated.length > 0) {
  const heading = RESET_PASSPHRASES ? "passphrases reset" : "accounts created";
  console.log(`\n=== Match Monsters: ${heading} ===`);
  console.log("These passphrases are shown once and are not recoverable.\n");
  console.log(generated.join("\n"));
  console.log(
    "\nLost one? Set MM_RESET_PASSPHRASES=1 in the env file, restart once, then",
  );
  console.log("remove it again. Saved matches are kept.\n");
}

const game = new Game(store);

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  // normalize() collapses any ../ before we join, so the resolved path cannot
  // escape STATIC_DIR.
  const candidate = join(STATIC_DIR, normalize(pathname));
  if (!candidate.startsWith(STATIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  const file =
    existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(STATIC_DIR, "index.html"); // SPA fallback

  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }

  const ext = extname(file);
  const immutable = file.includes("/assets/") && ext !== ".html";
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(file).pipe(res);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage, limit = 4096): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > limit) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolvePromise(body));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload));
}

function currentPlayer(req: IncomingMessage): PlayerIndex | null {
  const cookies = parseCookies(req.headers.cookie);
  return readSession(cookies[COOKIE_NAME], store.data.sessionSecret);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/api/login" && req.method === "POST") {
    let passphrase = "";
    try {
      passphrase = String(JSON.parse(await readBody(req))?.passphrase ?? "");
    } catch {
      json(res, 400, { ok: false, error: "Malformed request." } satisfies LoginResponse);
      return;
    }

    const index = ([0, 1] as PlayerIndex[]).find((i) =>
      verifyPassphrase(passphrase, store.data.users[i].passHash),
    );

    if (index === undefined) {
      // Uniform delay so a wrong passphrase cannot be distinguished by timing.
      await new Promise((r) => setTimeout(r, 250));
      json(res, 401, { ok: false, error: "That passphrase does not match." } satisfies LoginResponse);
      return;
    }

    const token = issueSession(index, store.data.sessionSecret);
    json(
      res,
      200,
      { ok: true, index, name: store.data.users[index].name } satisfies LoginResponse,
      { "Set-Cookie": sessionCookie(token, BEHIND_TLS) },
    );
    return;
  }

  if (url.pathname === "/api/me") {
    const index = currentPlayer(req);
    if (index === null) {
      // 200 rather than 401: this is a "who am I" probe the app makes on every
      // load, and a 401 shows up as a console error in the browser.
      json(res, 200, { ok: false } satisfies LoginResponse);
      return;
    }
    json(res, 200, { ok: true, index, name: store.data.users[index].name } satisfies LoginResponse);
    return;
  }

  if (url.pathname === "/api/logout" && req.method === "POST") {
    json(res, 200, { ok: true }, { "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0` });
    return;
  }

  if (url.pathname === "/api/health") {
    json(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405).end("Method not allowed");
});

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const index = currentPlayer(req);
  if (index === null) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => attachSocket(ws, index));
});

function attachSocket(ws: WebSocket, index: PlayerIndex): void {
  const connection: Connection = {
    index,
    send: (message: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    },
  };

  game.attach(connection);

  ws.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      connection.send({ t: "error", message: "Malformed message." });
      return;
    }
    try {
      game.handle(connection, message);
    } catch (error) {
      console.error("handler failed", error);
      connection.send({ t: "error", message: "Something went wrong handling that." });
    }
  });

  ws.on("close", () => game.detach(connection));
  ws.on("error", () => game.detach(connection));
}

// Drop connections that stop responding, so "online" stays honest.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if ((ws as WebSocket & { isAlive?: boolean }).isAlive === false) {
      ws.terminate();
      continue;
    }
    (ws as WebSocket & { isAlive?: boolean }).isAlive = false;
    ws.ping();
  }
}, 30_000);

wss.on("connection", (ws) => {
  (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
  ws.on("pong", () => {
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
  });
});

// ---------------------------------------------------------------------------

server.listen(PORT, HOST, () => {
  console.log(`Match Monsters listening on http://${HOST}:${PORT}`);
  console.log(`  state:  ${resolve(STATE_PATH)}`);
  console.log(`  static: ${STATIC_DIR}`);
});

function shutdown(signal: string): void {
  console.log(`\n${signal} received, shutting down.`);
  clearInterval(heartbeat);
  store.flushNow();
  for (const ws of wss.clients) ws.close(1001, "Server shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
