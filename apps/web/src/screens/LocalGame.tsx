import { useCallback, useState } from "react";
import {
  applyMove,
  createMatch,
  type MatchState,
  type Move,
  type PlayerIndex,
  type SlotIndex,
} from "@mm/engine";
import { BattleView } from "../components/BattleView";
import { TeamSelect } from "../components/TeamSelect";
import { useAnimator } from "../useAnimator";

const NAMES: [string, string] = ["Player One", "Player Two"];

interface Setup {
  teams: [[string, string], [string, string]];
  seed: number;
  first: PlayerIndex;
}

/** Hot-seat: one device, both players, no server involved. */
export function LocalGame({ onExit }: { onExit: () => void }) {
  const [setup, setSetup] = useState<Setup | null>(null);

  if (!setup) {
    return (
      <div>
        <TeamSelect
          names={NAMES}
          onStart={(teams, seed) => setSetup({ teams, seed, first: (seed % 2) as PlayerIndex })}
        />
        <div className="select-escape">
          <button type="button" onClick={onExit}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return <LocalBattle setup={setup} key={setup.seed} onQuit={() => setSetup(null)} />;
}

function LocalBattle({ setup, onQuit }: { setup: Setup; onQuit: () => void }) {
  const [match, setMatch] = useState<MatchState>(() =>
    createMatch({ seed: setup.seed, teams: setup.teams, first: setup.first }),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const { tiles, busy, banner, notes, play } = useAnimator(match);

  const submit = useCallback(
    async (move: Move) => {
      if (busy || match.winner !== null) return;

      const result = applyMove(match, move);
      const rejection = result.events.find((e) => e.type === "moveRejected");
      if (rejection && rejection.type === "moveRejected") {
        setNotice(rejection.reason);
        setTimeout(() => setNotice(null), 1800);
        return;
      }

      await play(result.events, result.state);
      setMatch(result.state);
    },
    [busy, match, play],
  );

  return (
    <BattleView
      match={match}
      names={NAMES}
      you={null}
      tiles={tiles}
      busy={busy}
      banner={banner}
      notice={notice}
      notes={notes}
      onMove={(move) => void submit(move)}
      onEvolve={(slot: SlotIndex) => void submit({ type: "evolve", slot })}
      onBoost={(slot: SlotIndex) => void submit({ type: "boost", slot })}
      onPass={() => void submit({ type: "pass" })}
      onLeave={onQuit}
      leaveLabel="New match"
    />
  );
}
