import type { Element, TileKind } from "@mm/engine";

/**
 * Placeholder art.
 *
 * Every monster also resolves `/assets/monsters/<id>.png`; when that file
 * exists it replaces the emoji automatically, so generated sprites can be
 * dropped in one at a time without touching any code.
 */
export const MONSTER_EMOJI: Record<string, string> = {
  bonzumi: "🦝",
  bonzire: "🔥",
  pyrokun: "🦊",
  magnooki: "🌋",
  timingo: "🦩",
  flambagant: "🕊️",
  ferobite: "🐺",
  fursway: "🐻",

  pelijet: "🐦",
  sephanix: "🦅",
  trashark: "🦈",
  shardivore: "🐋",
  nerverack: "🦑",
  wreckore: "🐙",

  turtlelisk: "🐢",
  karaggon: "🐉",
  elfini: "🧚",
  eidelf: "🌸",
  birchee: "🌱",
  birchard: "🌳",
  tropina: "🍍",
  pinathotlada: "🥭",

  slickitty: "🐈",
  axelraze: "⚡",
  winklit: "✨",
  gleamur: "🌟",
  glowzard: "🦎",
  radiaze: "☢️",

  barbenin: "🦂",
  scoprikon: "🕷️",
  criminook: "🦡",
  bandicrook: "🦫",
};

export function monsterSprite(id: string): string {
  return `/assets/monsters/${id}.png`;
}

export function monsterEmoji(id: string): string {
  return MONSTER_EMOJI[id] ?? "❓";
}

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: "#ff6a4d",
  water: "#43a9e8",
  earth: "#5cc45f",
  electric: "#f5cc37",
  psychic: "#b07de8",
};

export const TILE_COLOR: Record<TileKind, string> = {
  ...ELEMENT_COLOR,
  berry: "#f2609b",
};

export const TILE_GLYPH: Record<TileKind, string> = {
  fire: "🔥",
  water: "💧",
  earth: "🍃",
  electric: "⚡",
  psychic: "🔮",
  berry: "🍒",
};

export const ELEMENT_LABEL: Record<Element, string> = {
  fire: "Fire",
  water: "Water",
  earth: "Earth",
  electric: "Electric",
  psychic: "Psychic",
};
