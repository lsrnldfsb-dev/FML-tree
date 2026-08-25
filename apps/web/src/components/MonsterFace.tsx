import { useState } from "react";
import { monsterEmoji, monsterSprite } from "../art";

/**
 * Shows generated art when `/assets/monsters/<id>.png` exists and falls back to
 * a placeholder emoji when it does not, so sprites can be added one at a time.
 */
export function MonsterFace({ id, className }: { id: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`face face-emoji ${className ?? ""}`} aria-hidden="true">
        {monsterEmoji(id)}
      </span>
    );
  }

  return (
    <img
      className={`face face-img ${className ?? ""}`}
      src={monsterSprite(id)}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}
