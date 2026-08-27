import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SlotIndex } from "@mm/engine";
import type { Snapshot } from "@mm/shared";
import { ELEMENT_COLOR } from "../art";
import { BattleView } from "../components/BattleView";
import { MonsterPicker } from "../components/MonsterPicker";
import { MonsterFace } from "../components/MonsterFace";
import { NetClient, logout, type ConnectionState } from "../net";
import { useAnimator } from "../useAnimator";

export function OnlineGame({ onSignedOut }: { onSignedOut: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [notice, setNotice] = useState<string | null>(null);

  const animator = useAnimator(null);
  const { play, syncTo } = animator;

  // Kept in a ref so the socket callbacks never need re-registering.
  const pendingMatchId = useRef<string | null>(null);
  const netRef = useRef<NetClient | null>(null);

  const flashNotice = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? null : current)), 2200);
  }, []);

  useEffect(() => {
    const net = new NetClient({
      onSnapshot: (next) => {
        setSnapshot(next);
        // Only hard-sync the board when we are not mid-animation for this match;
        // otherwise the events currently playing own the tiles.
        if (next.matchId !== pendingMatchId.current) {
          pendingMatchId.current = next.matchId;
          syncTo(next.match);
        }
      },
      onEvents: (matchId, events, match) => {
        pendingMatchId.current = matchId;
        setSnapshot((current) => (current ? { ...current, matchId, match } : current));
        void play(events, match);
      },
      onError: flashNotice,
      onConnectionChange: setConnection,
    });

    netRef.current = net;
    net.connect();
    return () => {
      net.close();
      netRef.current = null;
    };
  }, [play, syncTo, flashNotice]);

  const send = netRef.current?.send.bind(netRef.current);

  const signOut = async () => {
    netRef.current?.close();
    await logout();
    onSignedOut();
  };

  if (!snapshot) {
    return (
      <div className="login">
        <div className="login-card">
          <p className="eyebrow">Match Monsters</p>
          <h1>{connection === "closed" ? "Reconnecting…" : "Connecting…"}</h1>
          <p className="login-sub">
            {connection === "closed"
              ? "Lost the connection to the server. Trying again."
              : "Loading your game."}
          </p>
        </div>
      </div>
    );
  }

  const you = snapshot.you;
  const opponent = you === 0 ? 1 : 0;
  const names: [string, string] = [snapshot.players[0].name, snapshot.players[1].name];

  const banner = connection !== "open" ? "Reconnecting…" : animator.banner;

  if (snapshot.phase === "match" && snapshot.match && snapshot.matchId) {
    const match = snapshot.match;
    const matchId = snapshot.matchId;
    const waiting =
      match.winner === null && match.active !== you
        ? `${names[opponent]}${snapshot.players[opponent].online ? " is playing" : " is away — their move"}`
        : null;

    return (
      <BattleView
        match={match}
        names={names}
        you={you}
        tiles={animator.tiles}
        busy={animator.busy || connection !== "open"}
        banner={banner}
        notice={notice}
        notes={animator.notes}
        waitingLabel={waiting}
        onMove={(move) => send?.({ t: "move", matchId, move })}
        onEvolve={(slot: SlotIndex) => send?.({ t: "move", matchId, move: { type: "evolve", slot } })}
        onBoost={(slot: SlotIndex) => send?.({ t: "move", matchId, move: { type: "boost", slot } })}
        onPass={() => send?.({ t: "move", matchId, move: { type: "pass" } })}
        onLeave={() =>
          match.winner === null
            ? flashNotice("Finish the match first — use End turn to pass.")
            : send?.({ t: "returnToLobby" })
        }
        leaveLabel={match.winner === null ? "Leave" : "New match"}
      />
    );
  }

  return (
    <Lobby
      snapshot={snapshot}
      connection={connection}
      notice={notice}
      onSubmitTeam={(team) => send?.({ t: "submitTeam", team })}
      onClearTeam={() => send?.({ t: "clearTeam" })}
      onSignOut={() => void signOut()}
    />
  );
}

interface LobbyProps {
  snapshot: Snapshot;
  connection: ConnectionState;
  notice: string | null;
  onSubmitTeam: (team: [string, string]) => void;
  onClearTeam: () => void;
  onSignOut: () => void;
}

function Lobby({ snapshot, connection, notice, onSubmitTeam, onClearTeam, onSignOut }: LobbyProps) {
  const you = snapshot.you;
  const opponent = you === 0 ? 1 : 0;
  const mine = snapshot.players[you];
  const theirs = snapshot.players[opponent];

  const record = useMemo(() => {
    let wins = 0;
    for (const entry of snapshot.history) if (entry.winner === you) wins++;
    return { wins, losses: snapshot.history.length - wins };
  }, [snapshot.history, you]);

  const status = (
    <div className="lobby-status">
      <span className={`dot ${connection === "open" ? "is-on" : ""}`} />
      <span>
        {theirs.name} is {theirs.online ? "online" : "offline"}
      </span>
      <span className="lobby-record">
        {record.wins}W · {record.losses}L
      </span>
      <button type="button" className="linky" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );

  if (mine.team) {
    return (
      <div className="login">
        <div className="login-card">
          <p className="eyebrow">Waiting</p>
          <h1>Team locked in</h1>
          <div className="lobby-team">
            {mine.team.map((id) => (
              <span key={id} className="lobby-chip">
                <MonsterFace id={id} />
              </span>
            ))}
          </div>
          <p className="login-sub">
            {theirs.online
              ? `Waiting for ${theirs.name} to pick.`
              : `${theirs.name} is offline. The match starts as soon as they pick — you can close this.`}
          </p>
          <button type="button" className="login-alt" onClick={onClearTeam}>
            Change my team
          </button>
          {notice && <p className="login-error">{notice}</p>}
          {status}
        </div>
      </div>
    );
  }

  return (
    <>
      <MonsterPicker
        heading={
          <h1>
            <span style={{ color: ELEMENT_COLOR.electric }}>{mine.name}</span>, pick two monsters
          </h1>
        }
        subtitle={
          theirs.team
            ? `${theirs.name} has already picked. The match starts the moment you lock in.`
            : "One monster per element. Your team only earns mana from tiles matching the elements you field."
        }
        ctaLabel={theirs.team ? "Lock in and start" : "Lock in"}
        onConfirm={onSubmitTeam}
      />
      <div className="lobby-footer">
        {notice && <p className="login-error">{notice}</p>}
        {status}
      </div>
    </>
  );
}
