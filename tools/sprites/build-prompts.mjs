#!/usr/bin/env node
/**
 * Assembles the monster prompts into paste-ready text.
 *
 *   node tools/sprites/build-prompts.mjs               all monsters
 *   node tools/sprites/build-prompts.mjs --pilot       the five-monster style pilot
 *   node tools/sprites/build-prompts.mjs bonzumi pelijet
 *   node tools/sprites/build-prompts.mjs --tiles
 *   node tools/sprites/build-prompts.mjs --json        for piping into a generator
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const spec = JSON.parse(
  readFileSync(fileURLToPath(new URL("./prompts.json", import.meta.url)), "utf8"),
);

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const ids = args.filter((a) => !a.startsWith("--"));

const assemble = (subject) => `${spec.style.prefix} ${subject} ${spec.style.suffix}`;

let items;
if (flags.has("--tiles")) {
  items = spec.tiles;
} else if (flags.has("--pilot")) {
  items = spec.monsters.filter((m) => spec.pilot.includes(m.id));
} else if (ids.length > 0) {
  items = spec.monsters.filter((m) => ids.includes(m.id));
  const missing = ids.filter((id) => !items.some((m) => m.id === id));
  if (missing.length) {
    console.error(`Unknown monster id(s): ${missing.join(", ")}`);
    process.exit(1);
  }
} else {
  items = spec.monsters;
}

if (flags.has("--json")) {
  console.log(
    JSON.stringify(
      {
        negative: spec.style.negative,
        target: spec.target,
        items: items.map((item) => ({
          id: item.id,
          file: `${item.id}.png`,
          prompt: assemble(item.subject),
        })),
      },
      null,
      2,
    ),
  );
} else {
  console.log(`Negative prompt (use for every image):\n${spec.style.negative}\n`);
  console.log(`Output: ${spec.target.size}x${spec.target.size} PNG -> ${spec.target.outputDir}/\n`);
  console.log("=".repeat(78));
  for (const item of items) {
    const label = item.name ? `${item.numId} · ${item.name}` : item.id;
    console.log(`\n${label}  ->  ${item.id}.png\n`);
    console.log(assemble(item.subject));
    console.log(`\n${"-".repeat(78)}`);
  }
  console.log(`\n${items.length} prompt(s).`);
}
