import { useState, type ReactNode } from "react";
import { BASE_FORMS, ELEMENTS, getMonster, validateTeam, type Element } from "@mm/engine";
import { ELEMENT_COLOR, ELEMENT_LABEL } from "../art";
import { MonsterFace } from "./MonsterFace";

interface MonsterPickerProps {
  heading: ReactNode;
  subtitle?: string;
  ctaLabel: string;
  onConfirm: (team: [string, string]) => void;
  footer?: ReactNode;
}

/** One player choosing two monsters of different elements. */
export function MonsterPicker({
  heading,
  subtitle,
  ctaLabel,
  onConfirm,
  footer,
}: MonsterPickerProps) {
  const [team, setTeam] = useState<string[]>([]);

  const usedElements = new Set<Element>(team.map((id) => getMonster(id).element));

  const toggle = (id: string) => {
    const element = getMonster(id).element;
    setTeam((prev) => {
      const next = [...prev];
      const at = next.indexOf(id);
      if (at >= 0) next.splice(at, 1);
      else if (next.length < 2 && !next.some((m) => getMonster(m).element === element)) next.push(id);
      return next;
    });
  };

  const ready = team.length === 2 && validateTeam(team) === null;

  return (
    <div className="select">
      <header className="select-head">
        {heading}
        {subtitle && <p className="select-sub">{subtitle}</p>}
      </header>

      <div className="select-tray">
        {team.length === 0 && <p className="tray-empty">Nothing picked yet</p>}
        {team.map((id) => {
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
                const chosen = team.includes(def.id);
                const blocked = !chosen && (team.length >= 2 || usedElements.has(def.element));
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
        {footer}
        <button
          type="button"
          className="primary"
          disabled={!ready}
          onClick={() => ready && onConfirm([team[0]!, team[1]!])}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
