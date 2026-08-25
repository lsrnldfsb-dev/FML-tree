import { useState } from "react";
import { BASE_FORMS, ELEMENTS, getMonster, validateTeam, type Element } from "@mm/engine";
import { ELEMENT_COLOR, ELEMENT_LABEL } from "../art";
import { MonsterFace } from "./MonsterFace";

interface TeamSelectProps {
  names: [string, string];
  onStart: (teams: [[string, string], [string, string]], seed: number) => void;
}

/**
 * All Pick drafting for hot-seat play: each player picks two monsters of
 * different elements, passing the device between picks.
 */
export function TeamSelect({ names, onStart }: TeamSelectProps) {
  const [picking, setPicking] = useState<0 | 1>(0);
  const [teams, setTeams] = useState<[string[], string[]]>([[], []]);

  const current = teams[picking];
  const usedElements = new Set<Element>(current.map((id) => getMonster(id).element));

  const toggle = (id: string) => {
    const element = getMonster(id).element;
    setTeams((prev) => {
      const next: [string[], string[]] = [[...prev[0]], [...prev[1]]];
      const team = next[picking];
      const at = team.indexOf(id);
      if (at >= 0) team.splice(at, 1);
      else if (team.length < 2 && !team.some((m) => getMonster(m).element === element)) team.push(id);
      return next;
    });
  };

  const ready = current.length === 2 && validateTeam(current) === null;

  const advance = () => {
    if (!ready) return;
    if (picking === 0) {
      setPicking(1);
      return;
    }
    onStart(
      [
        [teams[0][0]!, teams[0][1]!],
        [teams[1][0]!, teams[1][1]!],
      ],
      Math.floor(Math.random() * 2 ** 31),
    );
  };

  return (
    <div className="select">
      <header className="select-head">
        <p className="eyebrow">All Pick · pass the device</p>
        <h1>
          <span style={{ color: ELEMENT_COLOR.electric }}>{names[picking]}</span>, pick two
          monsters
        </h1>
        <p className="select-sub">
          One monster per element. Your team only earns mana from tiles matching the elements you
          field.
        </p>
      </header>

      <div className="select-tray">
        {current.length === 0 && <p className="tray-empty">Nothing picked yet</p>}
        {current.map((id) => {
          const def = getMonster(id);
          return (
            <button
              key={id}
              type="button"
              className="tray-pick"
              style={{ ["--element" as string]: ELEMENT_COLOR[def.element] }}
              onClick={() => toggle(id)}
            >
              <MonsterFace id={id} />
              <span>{def.name}</span>
              <em>remove</em>
            </button>
          );
        })}
      </div>

      <div className="roster">
        {ELEMENTS.map((element) => (
          <section key={element} className="roster-group">
            <h3 style={{ color: ELEMENT_COLOR[element] }}>{ELEMENT_LABEL[element]}</h3>
            <div className="roster-row">
              {BASE_FORMS.filter((m) => m.element === element).map((def) => {
                const chosen = current.includes(def.id);
                const blocked = !chosen && (current.length >= 2 || usedElements.has(def.element));
                return (
                  <button
                    key={def.id}
                    type="button"
                    className={`roster-card ${chosen ? "is-chosen" : ""}`}
                    disabled={blocked}
                    onClick={() => toggle(def.id)}
                    style={{ ["--element" as string]: ELEMENT_COLOR[def.element] }}
                  >
                    <MonsterFace id={def.id} />
                    <strong>{def.name}</strong>
                    <span className="roster-cost">{def.mana} mana</span>
                    <p>{def.text}</p>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="select-foot">
        <button type="button" className="primary" disabled={!ready} onClick={advance}>
          {picking === 0 ? `Lock in — hand to ${names[1]}` : "Start the match"}
        </button>
      </div>
    </div>
  );
}
