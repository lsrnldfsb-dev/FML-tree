import { useState } from "react";
import { ELEMENT_COLOR } from "../art";
import { MonsterPicker } from "./MonsterPicker";

interface TeamSelectProps {
  names: [string, string];
  onStart: (teams: [[string, string], [string, string]], seed: number) => void;
}

/** Hot-seat All Pick: each player picks in turn, passing the device across. */
export function TeamSelect({ names, onStart }: TeamSelectProps) {
  const [first, setFirst] = useState<[string, string] | null>(null);

  const picking = first === null ? 0 : 1;

  return (
    <MonsterPicker
      key={picking}
      heading={
        <h1>
          <span style={{ color: ELEMENT_COLOR.electric }}>{names[picking]}</span>, pick two monsters
        </h1>
      }
      subtitle="One monster per element. Your team only earns mana from tiles matching the elements you field."
      ctaLabel={picking === 0 ? `Lock in — hand to ${names[1]}` : "Start the match"}
      onConfirm={(team) => {
        if (first === null) setFirst(team);
        else onStart([first, team], Math.floor(Math.random() * 2 ** 31));
      }}
    />
  );
}
