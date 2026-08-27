import { TILE_COLOR, TILE_GLYPH } from "../art";
import type { RenderTile } from "../useAnimator";

interface BoardProps {
  size: number;
  tiles: RenderTile[];
  selected: number | null;
  hint: { a: number; b: number } | null;
  disabled: boolean;
  onTap: (index: number) => void;
}

export function Board({ size, tiles, selected, hint, disabled, onTap }: BoardProps) {
  const step = 100 / size;

  const cells = Array.from({ length: size * size }, (_, i) => i);
  const hinted = new Set(hint ? [hint.a, hint.b] : []);

  return (
    <div className="board" style={{ ["--size" as string]: size }}>
      <div className="board-grid">
        {cells.map((index) => (
          <div key={index} className="board-cell" />
        ))}
      </div>

      <div className="board-tiles">
        {tiles.map((tile) => {
          const x = tile.index % size;
          const y = Math.floor(tile.index / size);
          const classes = [
            "tile",
            `tile-${tile.kind}`,
            tile.matching ? "is-matching" : "",
            tile.spawning ? "is-spawning" : "",
            selected === tile.index ? "is-selected" : "",
            hinted.has(tile.index) ? "is-hinted" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={tile.id}
              type="button"
              className={classes}
              disabled={disabled}
              onClick={() => onTap(tile.index)}
              aria-label={`${tile.kind} tile, column ${x + 1}, row ${y + 1}`}
              style={{
                left: `${x * step}%`,
                top: `${y * step}%`,
                width: `${step}%`,
                height: `${step}%`,
                ["--tile-color" as string]: TILE_COLOR[tile.kind],
              }}
            >
              <span className="tile-face" aria-hidden="true">
                {TILE_GLYPH[tile.kind]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
