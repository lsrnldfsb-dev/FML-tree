import type { Element, MonsterDef } from "./types.js";

/**
 * Roster data.
 *
 * This covers the contiguous, fully-specified block of the design document
 * (IDs 001-030) plus the Tropina line (059-060). Monsters that need lifecycle
 * hooks or persistent counters -- Gargice's stances, Cactkid's bullets,
 * Kittea's charges, Voltshard's reflect shield, Petirex, Echomori, Abyssoul,
 * Aromaphant -- are deliberately held back until the hook system is exercised
 * in P2. Nothing here needs an engine change to add them; they are data.
 *
 * Where the document omits a number, the choice made here is called out in a
 * comment so it can be revisited during balancing.
 */
export const MONSTERS: readonly MonsterDef[] = [
  // -------------------------------------------------------------------------
  // Fire — row and column destruction, direct burst
  // -------------------------------------------------------------------------
  {
    id: "bonzumi",
    numId: "001",
    name: "Bonzumi",
    element: "fire",
    mana: 8,
    skill: "Flare",
    text: "Deals 20 damage and clears a random column.",
    effects: [
      { k: "damage", n: 20 },
      { k: "clearColumn", n: 1 },
    ],
    evolved: false,
    evolvesTo: "bonzire",
  },
  {
    id: "bonzire",
    numId: "002",
    name: "Bonzire",
    element: "fire",
    mana: 8,
    skill: "Flare+",
    text: "Deals 25 damage and clears two random columns.",
    effects: [
      { k: "damage", n: 25 },
      { k: "clearColumn", n: 2 },
    ],
    evolved: true,
  },
  {
    id: "pyrokun",
    numId: "011",
    name: "Pyrokun",
    element: "fire",
    mana: 9,
    skill: "Pyro Blitz",
    text: "Deals 20 damage and clears a random row.",
    effects: [
      { k: "damage", n: 20 },
      { k: "clearRow", n: 1 },
    ],
    evolved: false,
    evolvesTo: "magnooki",
  },
  {
    id: "magnooki",
    numId: "012",
    name: "Magnooki",
    element: "fire",
    mana: 9,
    skill: "Pyro Blitz+",
    text: "Deals 30 damage and clears a random row and a random column.",
    effects: [
      { k: "damage", n: 30 },
      { k: "clearRow", n: 1 },
      { k: "clearColumn", n: 1 },
    ],
    evolved: true,
  },
  {
    id: "timingo",
    numId: "019",
    name: "Timingo",
    element: "fire",
    mana: 7,
    skill: "Hugs",
    text: "Deals 10 damage and gives 2 mana to your other monster.",
    effects: [
      { k: "damage", n: 10 },
      { k: "grantManaAlly", n: 2 },
    ],
    evolved: false,
    evolvesTo: "flambagant",
  },
  {
    id: "flambagant",
    numId: "020",
    name: "Flambagant",
    element: "fire",
    mana: 7,
    skill: "Hugs+",
    text: "Deals 20 damage and gives 3 mana to your other monster.",
    effects: [
      { k: "damage", n: 20 },
      { k: "grantManaAlly", n: 3 },
    ],
    evolved: true,
  },
  {
    id: "ferobite",
    numId: "029",
    name: "Ferobite",
    element: "fire",
    mana: 4,
    skill: "Maim",
    text: "Deals 5 damage and stops a random enemy monster gaining mana for 3 moves.",
    effects: [
      { k: "damage", n: 5 },
      { k: "lockMonster", moves: 3 },
    ],
    evolved: false,
    evolvesTo: "fursway",
  },
  {
    id: "fursway",
    numId: "030",
    name: "Fursway",
    element: "fire",
    mana: 4,
    skill: "Maim+",
    text: "Deals 15 damage and stops a random enemy monster gaining mana for 3 moves.",
    // The document does not give Maim+ a lock duration; matched to Maim pending balance.
    effects: [
      { k: "damage", n: 15 },
      { k: "lockMonster", moves: 3 },
    ],
    evolved: true,
  },

  // -------------------------------------------------------------------------
  // Water — tile conversion and self-feeding cascade loops
  // -------------------------------------------------------------------------
  {
    id: "pelijet",
    numId: "003",
    name: "Pelijet",
    element: "water",
    mana: 6,
    skill: "Hydro Rush",
    text: "Deals 10 damage and turns 3 random tiles into water.",
    effects: [
      { k: "damage", n: 10 },
      { k: "convertTiles", n: 3, to: "water" },
    ],
    evolved: false,
    evolvesTo: "sephanix",
  },
  {
    id: "sephanix",
    numId: "004",
    name: "Sephanix",
    element: "water",
    mana: 6,
    skill: "Hydro Rush+",
    text: "Deals 20 damage and turns 3 random tiles into water.",
    effects: [
      { k: "damage", n: 20 },
      { k: "convertTiles", n: 3, to: "water" },
    ],
    evolved: true,
  },
  {
    id: "trashark",
    numId: "013",
    name: "Trashark",
    element: "water",
    mana: 8,
    skill: "Aqua Blast",
    text: "Deals 20 damage and turns 2 random tiles into water.",
    effects: [
      { k: "damage", n: 20 },
      { k: "convertTiles", n: 2, to: "water" },
    ],
    evolved: false,
    evolvesTo: "shardivore",
  },
  {
    id: "shardivore",
    numId: "014",
    name: "Shardivore",
    element: "water",
    mana: 8,
    skill: "Aqua Blast+",
    text: "Deals 25 damage and turns 4 random tiles into water.",
    effects: [
      { k: "damage", n: 25 },
      { k: "convertTiles", n: 4, to: "water" },
    ],
    evolved: true,
  },
  {
    id: "nerverack",
    numId: "023",
    name: "Nerverack",
    element: "water",
    mana: 9,
    skill: "Punish",
    text: "Deals 30 damage, but you lose a move next turn.",
    effects: [
      { k: "damage", n: 30 },
      { k: "modifyMoves", n: -1, who: "self", turns: 1 },
    ],
    evolved: false,
    evolvesTo: "wreckore",
  },
  {
    id: "wreckore",
    numId: "024",
    name: "Wreckore",
    element: "water",
    mana: 9,
    skill: "Punish+",
    text: "Deals 40 damage, but you lose a move on each of your next 2 turns.",
    effects: [
      { k: "damage", n: 40 },
      { k: "modifyMoves", n: -1, who: "self", turns: 2 },
    ],
    evolved: true,
  },

  // -------------------------------------------------------------------------
  // Earth — sustain and the berry economy
  // -------------------------------------------------------------------------
  {
    id: "turtlelisk",
    numId: "005",
    name: "Turtlelisk",
    element: "earth",
    mana: 6,
    skill: "Heal Leaf",
    text: "Deals 10 damage and restores 10 health.",
    effects: [
      { k: "damage", n: 10 },
      { k: "heal", n: 10 },
    ],
    evolved: false,
    evolvesTo: "karaggon",
  },
  {
    id: "karaggon",
    numId: "006",
    name: "Karaggon",
    element: "earth",
    mana: 6,
    skill: "Heal Leaf+",
    text: "Deals 15 damage and restores 15 health.",
    effects: [
      { k: "damage", n: 15 },
      { k: "heal", n: 15 },
    ],
    evolved: true,
  },
  {
    id: "elfini",
    numId: "015",
    name: "Elfini",
    element: "earth",
    mana: 6,
    skill: "Flower Dance",
    text: "Deals 5 damage and restores 5 health per turn for 3 turns.",
    effects: [
      { k: "damage", n: 5 },
      { k: "healOverTime", n: 5, turns: 3 },
    ],
    evolved: false,
    evolvesTo: "eidelf",
  },
  {
    id: "eidelf",
    numId: "016",
    name: "Eidelf",
    element: "earth",
    mana: 6,
    skill: "Flower Dance+",
    text: "Deals 10 damage and restores 10 health per turn for 2 turns.",
    effects: [
      { k: "damage", n: 10 },
      { k: "healOverTime", n: 10, turns: 2 },
    ],
    evolved: true,
  },
  {
    id: "birchee",
    numId: "025",
    name: "Birchee",
    element: "earth",
    mana: 6,
    skill: "Harvest",
    text: "Deals 10 damage and drops a berry onto the board.",
    effects: [
      { k: "damage", n: 10 },
      { k: "spawnTiles", n: 1, to: "berry" },
    ],
    evolved: false,
    evolvesTo: "birchard",
  },
  {
    id: "birchard",
    numId: "026",
    name: "Birchard",
    element: "earth",
    mana: 6,
    skill: "Harvest+",
    text: "Deals 20 damage and drops 3 berries onto the board.",
    effects: [
      { k: "damage", n: 20 },
      { k: "spawnTiles", n: 3, to: "berry" },
    ],
    evolved: true,
  },
  {
    id: "tropina",
    numId: "059",
    name: "Tropina",
    element: "earth",
    mana: 4,
    skill: "Fruit Festival",
    text: "Deals 10 damage and turns 3 random tiles into berries.",
    effects: [
      { k: "damage", n: 10 },
      { k: "convertTiles", n: 3, to: "berry" },
    ],
    evolved: false,
    evolvesTo: "pinathotlada",
  },
  {
    id: "pinathotlada",
    numId: "060",
    name: "Pinathotlada",
    element: "earth",
    mana: 4,
    skill: "Fruit Festival+",
    text: "Deals 15 damage and turns 4 random tiles into berries.",
    effects: [
      { k: "damage", n: 15 },
      { k: "convertTiles", n: 4, to: "berry" },
    ],
    evolved: true,
  },

  // -------------------------------------------------------------------------
  // Electric — action economy and grid clears
  // -------------------------------------------------------------------------
  {
    id: "slickitty",
    numId: "007",
    name: "Slickitty",
    element: "electric",
    mana: 4,
    skill: "Electroclaw",
    text: "Deals 5 damage and clears a random 2x2 block.",
    effects: [
      { k: "damage", n: 5 },
      { k: "clearGrid", w: 2, h: 2 },
    ],
    evolved: false,
    evolvesTo: "axelraze",
  },
  {
    id: "axelraze",
    numId: "008",
    name: "Axelraze",
    element: "electric",
    mana: 4,
    skill: "Electroclaw+",
    text: "Deals 10 damage and clears a random 3x2 block.",
    effects: [
      { k: "damage", n: 10 },
      { k: "clearGrid", w: 3, h: 2 },
    ],
    evolved: true,
  },
  {
    id: "winklit",
    numId: "017",
    name: "Winklit",
    element: "electric",
    mana: 7,
    skill: "Starblitz",
    text: "Deals 15 damage and gives you an extra move next turn.",
    effects: [
      { k: "damage", n: 15 },
      { k: "modifyMoves", n: 1, who: "self", turns: 1 },
    ],
    evolved: false,
    evolvesTo: "gleamur",
  },
  {
    id: "gleamur",
    numId: "018",
    name: "Gleamur",
    element: "electric",
    mana: 7,
    skill: "Starblitz+",
    text: "Deals 20 damage and gives you an extra move on each of your next 2 turns.",
    effects: [
      { k: "damage", n: 20 },
      { k: "modifyMoves", n: 1, who: "self", turns: 2 },
    ],
    evolved: true,
  },
  {
    id: "glowzard",
    numId: "027",
    name: "Glowzard",
    element: "electric",
    mana: 9,
    skill: "Overload",
    text: "Deals 15 damage, clears 4 random tiles, and takes a move off your opponent's next turn.",
    effects: [
      { k: "damage", n: 15 },
      { k: "modifyMoves", n: -1, who: "opponent", turns: 1 },
      { k: "clearRandom", n: 4 },
    ],
    evolved: false,
    evolvesTo: "radiaze",
  },
  {
    id: "radiaze",
    numId: "028",
    name: "Radiaze",
    element: "electric",
    mana: 9,
    skill: "Overload+",
    text: "Deals 25 damage, clears 8 random tiles, and takes a move off your opponent's next turn.",
    effects: [
      { k: "damage", n: 25 },
      { k: "modifyMoves", n: -1, who: "opponent", turns: 1 },
      { k: "clearRandom", n: 8 },
    ],
    evolved: true,
  },

  // -------------------------------------------------------------------------
  // Psychic — mana denial and theft
  // -------------------------------------------------------------------------
  {
    id: "barbenin",
    numId: "009",
    name: "Barbenin",
    element: "psychic",
    mana: 6,
    skill: "Psycho Bite",
    text: "Deals 10 damage and drains 2 mana from each enemy monster.",
    effects: [
      { k: "damage", n: 10 },
      { k: "drainMana", n: 2 },
    ],
    evolved: false,
    evolvesTo: "scoprikon",
  },
  {
    id: "scoprikon",
    numId: "010",
    name: "Scoprikon",
    element: "psychic",
    mana: 6,
    skill: "Psycho Bite+",
    text: "Deals 15 damage and drains 3 mana from each enemy monster.",
    effects: [
      { k: "damage", n: 15 },
      { k: "drainMana", n: 3 },
    ],
    evolved: true,
  },
  {
    id: "criminook",
    numId: "021",
    name: "Criminook",
    element: "psychic",
    mana: 7,
    skill: "Pickpocket",
    text: "Deals 10 damage and steals 1 berry and 1 mana.",
    effects: [
      { k: "damage", n: 10 },
      { k: "stealBerries", n: 1 },
      { k: "stealMana", n: 1 },
    ],
    evolved: false,
    evolvesTo: "bandicrook",
  },
  {
    id: "bandicrook",
    numId: "022",
    name: "Bandicrook",
    element: "psychic",
    mana: 7,
    skill: "Pickpocket+",
    text: "Deals 15 damage and steals 2 berries and 2 mana.",
    effects: [
      { k: "damage", n: 15 },
      { k: "stealBerries", n: 2 },
      { k: "stealMana", n: 2 },
    ],
    evolved: true,
  },
];

const BY_ID = new Map<string, MonsterDef>(MONSTERS.map((m) => [m.id, m]));

export function getMonster(id: string): MonsterDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown monster: ${id}`);
  return def;
}

export function tryGetMonster(id: string): MonsterDef | undefined {
  return BY_ID.get(id);
}

/** Base forms only — the pool players pick from. */
export const BASE_FORMS: readonly MonsterDef[] = MONSTERS.filter((m) => !m.evolved);

export function baseFormsByElement(element: Element): MonsterDef[] {
  return BASE_FORMS.filter((m) => m.element === element);
}
