import { useMemo, useState } from "react";
import type { PlayerIndex, SlotIndex } from "@mm/engine";
import { Board } from "./components/Board";
import { PlayerPanel } from "./components/PlayerPanel";
import { TeamSelect } from "./components/TeamSelect";
import { useBattle } from "./useBattle";

const NAMES: [string, string] = ["Player One", "Player Two"];

interface Setup {
  teams: [[string, string], [string, string]];
  seed: number;
  first: PlayerIndex;
}

export default function App() {
  const [setup, setSetup] = useState<Setup | null>(null);

  if (!setup) {
    return (
      <TeamSelect
        names={NAMES}
        onStart={(teams, seed) =>
          setSetup({ teams, seed, first: (seed % 2) as PlayerIndex })
        }
      />
    );
  }

  return <Battle setup={setup} onQuit={() => setSetup(null)} key={setup.seed} />;
}

function Battle({ setup, onQuit }: { setup: Setup; onQuit: () => void }) {
  const [showHint, setShowHint] = useState(false);
  const battle = useBattle({ seed: setup.seed, teams: setup.teams, first: setup.first });
  const { match, tiles, busy, banner, notice, notes, selected, hints } = battle;

  const hint = useMemo(() => (showHint && hints.length > 0 ? hints[0]! : null), [showHint, hints]);
  const winner = match.winner;

  return (
    <div className="battle">
      <PlayerPanel
        state={match}
        player={1}
        name={NAMES[1]}
        notes={notes}
        busy={busy}
        onEvolve={(slot: SlotIndex) => void battle.submit({ type: "evolve", slot })}
        onBoost={(slot: SlotIndex) => void battle.submit({ type: "boost", slot })}
      />

      <div className="stage">
        <Board
          size={match.config.boardSize}
          tiles={tiles}
          selected={selected}
          hint={hint}
          disabled={busy || winner !== null}
          onTap={battle.tapTile}
        />

        {banner && <div className="banner">{banner}</div>}
        {notice && <div className="notice">{notice}</div>}

        {winner !== null && (
          <div className="overlay">
            <div className="overlay-card">
              <p className="eyebrow">Match over</p>
              <h2>{NAMES[winner]} wins</h2>
              <p>
                {match.players[winner].hp} health left after {match.turn} turns.
              </p>
              <button type="button" className="primary" onClick={onQuit}>
                New match
              </button>
            </div>
          </div>
        )}

        <div className="stage-tools">
          <button type="button" onClick={() => setShowHint((v) => !v)} disabled={busy}>
            {showHint ? "Hide hint" : "Show hint"}
          </button>
          <button
            type="button"
            onClick={() => void battle.submit({ type: "pass" })}
            disabled={busy || winner !== null}
          >
            End turn
          </button>
          <button type="button" onClick={onQuit}>
            Quit
          </button>
        </div>
      </div>

      <PlayerPanel
        state={match}
        player={0}
        name={NAMES[0]}
        notes={notes}
        busy={busy}
        onEvolve={(slot: SlotIndex) => void battle.submit({ type: "evolve", slot })}
        onBoost={(slot: SlotIndex) => void battle.submit({ type: "boost", slot })}
      />
    </div>
  );
}
