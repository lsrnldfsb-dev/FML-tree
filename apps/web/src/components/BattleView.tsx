import { useMemo, useState } from "react";
import { legalSwaps, type MatchState, type PlayerIndex, type SlotIndex } from "@mm/engine";
import type { FloatingNote, RenderTile } from "../useAnimator";
import { Board } from "./Board";
import { PlayerPanel } from "./PlayerPanel";

interface BattleViewProps {
  match: MatchState;
  names: [string, string];
  /** Which side this device controls, or null for hot-seat (both sides). */
  you: PlayerIndex | null;
  tiles: RenderTile[];
  busy: boolean;
  banner: string | null;
  notice: string | null;
  notes: FloatingNote[];
  /** Shown instead of the board controls when waiting on the other player. */
  waitingLabel?: string | null;
  onMove: (move: { type: "swap"; a: number; b: number }) => void;
  onEvolve: (slot: SlotIndex) => void;
  onBoost: (slot: SlotIndex) => void;
  onPass: () => void;
  onLeave: () => void;
  leaveLabel: string;
}

export function BattleView({
  match,
  names,
  you,
  tiles,
  busy,
  banner,
  notice,
  notes,
  waitingLabel,
  onMove,
  onEvolve,
  onBoost,
  onPass,
  onLeave,
  leaveLabel,
}: BattleViewProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);

  const myTurn = you === null ? match.winner === null : match.active === you && match.winner === null;
  const locked = busy || !myTurn || match.winner !== null;

  const hints = useMemo(() => (showHint && !locked ? legalSwaps(match) : []), [showHint, locked, match]);
  const hint = hints.length > 0 ? hints[0]! : null;

  // Your side sits at the bottom; online that is fixed, hot-seat keeps P1 low.
  const bottom: PlayerIndex = you ?? 0;
  const top: PlayerIndex = bottom === 0 ? 1 : 0;

  const tapTile = (index: number) => {
    if (locked) return;
    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    const a = selected;
    setSelected(null);
    onMove({ type: "swap", a, b: index });
  };

  const panelFor = (player: PlayerIndex) => (
    <PlayerPanel
      state={match}
      player={player}
      name={names[player]}
      notes={notes}
      busy={busy}
      controllable={you === null || player === you}
      isYou={you === null || player === you}
      onEvolve={onEvolve}
      onBoost={onBoost}
    />
  );

  return (
    <div className="battle">
      {panelFor(top)}

      <div className="stage">
        <Board
          size={match.config.boardSize}
          tiles={tiles}
          selected={selected}
          hint={hint}
          disabled={locked}
          onTap={tapTile}
        />

        {banner && <div className="banner">{banner}</div>}
        {notice && <div className="notice">{notice}</div>}

        {waitingLabel && match.winner === null && (
          <div className="waiting">{waitingLabel}</div>
        )}

        {match.winner !== null && (
          <div className="overlay">
            <div className="overlay-card">
              <p className="eyebrow">Match over</p>
              <h2>
                {you !== null && match.winner === you ? "You win" : `${names[match.winner]} wins`}
              </h2>
              <p>
                {match.players[match.winner].hp} health left after {match.turn} turns.
              </p>
              <button type="button" className="primary" onClick={onLeave}>
                {leaveLabel}
              </button>
            </div>
          </div>
        )}

        <div className="stage-tools">
          <button type="button" onClick={() => setShowHint((v) => !v)} disabled={locked}>
            {showHint ? "Hide hint" : "Show hint"}
          </button>
          <button type="button" onClick={onPass} disabled={locked}>
            End turn
          </button>
          <button type="button" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
      </div>

      {panelFor(bottom)}
    </div>
  );
}
