import type { ClientMessage, ServerMessage, Snapshot } from "@mm/shared";
import type { GameEvent, MatchState } from "@mm/engine";

export type ConnectionState = "connecting" | "open" | "closed";

export interface NetHandlers {
  onSnapshot: (snapshot: Snapshot) => void;
  onEvents: (matchId: string, events: GameEvent[], match: MatchState) => void;
  onError: (message: string) => void;
  onConnectionChange: (state: ConnectionState) => void;
}

/**
 * WebSocket wrapper with reconnect.
 *
 * Phones suspend sockets aggressively, so dropping and re-establishing is the
 * normal case rather than an error. Every reconnect gets a fresh snapshot from
 * the server, which is the only state the client trusts.
 */
export class NetClient {
  private socket: WebSocket | null = null;
  private closedByUs = false;
  private attempt = 0;
  private reconnectTimer: number | null = null;

  constructor(private readonly handlers: NetHandlers) {}

  connect(): void {
    this.closedByUs = false;
    this.open();
  }

  private open(): void {
    if (this.socket) return;

    this.handlers.onConnectionChange("connecting");

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/socket`);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.handlers.onConnectionChange("open");
    };

    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }

      switch (message.t) {
        case "snapshot":
          this.handlers.onSnapshot(message.snapshot);
          break;
        case "events":
          this.handlers.onEvents(message.matchId, message.events, message.match);
          break;
        case "error":
          this.handlers.onError(message.message);
          break;
        default:
          break;
      }
    };

    const drop = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.handlers.onConnectionChange("closed");
      if (!this.closedByUs) this.scheduleReconnect();
    };

    socket.onclose = drop;
    socket.onerror = drop;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    // Back off to 10s, with jitter so both players don't retry in lockstep.
    const base = Math.min(10_000, 500 * 2 ** this.attempt++);
    const delay = base * (0.7 + Math.random() * 0.6);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    this.closedByUs = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }
}

export async function login(passphrase: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  const body = (await res.json()) as { ok: boolean; error?: string };
  return body;
}

export async function whoAmI(): Promise<boolean> {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/logout", { method: "POST" });
}
