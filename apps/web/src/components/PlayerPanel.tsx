import { getMonster, type MatchState, type PlayerIndex, type SlotIndex } from "@mm/engine";
import { ELEMENT_COLOR } from "../art";
import type { FloatingNote } from "../useBattle";
import { MonsterFace } from "./MonsterFace";

interface PlayerPanelProps {
  state: MatchState;
  player: PlayerIndex;
  name: string;
  notes: FloatingNote[];
  busy: boolean;
  onEvolve: (slot: SlotIndex) => void;
  onBoost: (slot: SlotIndex) => void;
}

export function PlayerPanel({
  state,
  player,
  name,
  notes,
  busy,
  onEvolve,
  onBoost,
}: PlayerPanelProps) {
  const p = state.players[player];
  const isActive = state.active === player && state.winner === null;
  const hpPercent = Math.max(0, (p.hp / p.maxHp) * 100);

  return (
    <section className={`panel ${isActive ? "is-active" : ""}`} aria-label={`${name}'s status`}>
      <header className="panel-head">
        <div className="panel-name">
          <h2>{name}</h2>
          {isActive && <span className="turn-chip">Your turn</span>}
        </div>
        <div className="panel-hp">
          <span className="hp-value">
            {p.hp}
            <span className="hp-max">/{p.maxHp}</span>
          </span>
        </div>
      </header>

      <div className="hp-track">
        <div className="hp-fill" style={{ width: `${hpPercent}%` }} />
        {notes
          .filter((n) => n.target === player)
          .map((note) => (
            <span key={note.id} className={`float float-${note.tone}`}>
              {note.text}
            </span>
          ))}
      </div>

      <div className="panel-meta">
        <span className="berry-count" title="Berries">
          🍒 {p.berries}
        </span>
        {isActive && (
          <span className="moves" title="Moves left this turn">
            {Array.from({ length: Math.min(state.movesLeft, 6) }, (_, i) => (
              <i key={i} className="move-jewel" />
            ))}
            {state.movesLeft > 6 && <em>+{state.movesLeft - 6}</em>}
          </span>
        )}
      </div>

      <div className="monsters">
        {([0, 1] as SlotIndex[]).map((slot) => {
          const monster = p.monsters[slot];
          const def = getMonster(monster.defId);
          const manaPercent = (monster.mana / def.mana) * 100;
          const canEvolve =
            isActive &&
            !busy &&
            !monster.evolved &&
            !!def.evolvesTo &&
            p.berries >= state.config.evolveBerryCost &&
            state.movesLeft > 0;
          const canBoost =
            isActive &&
            !busy &&
            monster.evolved &&
            p.berries >= state.config.boostBerryCost &&
            state.movesLeft > 0;

          return (
            <article
              key={slot}
              className={`monster ${monster.lockedFor > 0 ? "is-locked" : ""}`}
              style={{ ["--element" as string]: ELEMENT_COLOR[def.element] }}
            >
              <MonsterFace id={def.id} />

              <div className="monster-body">
                <div className="monster-title">
                  <strong>{def.name}</strong>
                  <span className="mana-value">
                    {monster.mana}/{def.mana}
                  </span>
                </div>

                <div className="mana-track">
                  <div className="mana-fill" style={{ width: `${manaPercent}%` }} />
                </div>

                <p className="monster-text">{def.text}</p>

                {monster.lockedFor > 0 && (
                  <p className="monster-lock">Mana locked for {monster.lockedFor} more move(s)</p>
                )}

                <div className="monster-actions">
                  {!monster.evolved && def.evolvesTo && (
                    <button type="button" disabled={!canEvolve} onClick={() => onEvolve(slot)}>
                      Evolve · {state.config.evolveBerryCost}🍒
                    </button>
                  )}
                  {monster.evolved && (
                    <button type="button" disabled={!canBoost} onClick={() => onBoost(slot)}>
                      Boost +{state.config.boostManaAmount} · {state.config.boostBerryCost}🍒
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
