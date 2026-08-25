#!/usr/bin/env node
/**
 * Normalises generated sprites and files them where the game looks for them.
 *
 *   node tools/sprites/process.mjs <input-dir> [--size 512] [--keep-bg] [--dry]
 *
 * For each PNG or JPEG in the input directory whose basename matches a monster
 * id, this keys out a flat magenta background, trims the empty margin, pads the
 * result back to a square with a small even margin, resizes it, and writes it
 * to apps/web/public/assets/monsters/<id>.png.
 *
 * Originals are never modified. Files whose names do not match a known monster
 * are reported and skipped, so a typo is loud rather than silent.
 *
 * Optional -- the game will display any correctly named square PNG as-is. This
 * only exists to save you doing the cleanup by hand.
 *
 * Requires sharp:  pnpm add -w -D sharp
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT_DIR = join(REPO_ROOT, "apps/web/public/assets/monsters");

/** Pixels this close to pure magenta on every channel are treated as background. */
const KEY_TOLERANCE = 60;
/** Fraction of the output square left as empty margin around the subject. */
const MARGIN = 0.06;

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error(
    "This script needs sharp.\n\n  pnpm add -w -D sharp\n\n" +
      "You can also skip it entirely: any correctly named square PNG dropped\n" +
      `into ${OUT_DIR} works as-is.`,
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const inputDir = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry");
const keepBackground = args.includes("--keep-bg");
const sizeArg = args.indexOf("--size");
const SIZE = sizeArg >= 0 ? Number(args[sizeArg + 1]) : 512;

if (!inputDir) {
  console.error("Usage: node tools/sprites/process.mjs <input-dir> [--size 512] [--keep-bg] [--dry]");
  process.exit(1);
}

const spec = JSON.parse(
  readFileSync(fileURLToPath(new URL("./prompts.json", import.meta.url)), "utf8"),
);
const knownIds = new Set([...spec.monsters.map((m) => m.id), ...spec.tiles.map((t) => t.id)]);

const dir = resolve(inputDir);
if (!existsSync(dir)) {
  console.error(`No such directory: ${dir}`);
  process.exit(1);
}

/**
 * Keys out a magenta background and removes the colour cast it leaves behind.
 *
 * Two passes, because a global despill would ruin this roster: Barbenin,
 * Scoprikon, Criminook and Bandicrook are all purple, and purple reads as
 * "magenta-ish" to any naive test. So only near-pure magenta is keyed, and the
 * despill that cleans up antialiased edges is confined to a narrow band around
 * pixels that were actually background. Interior colour is never touched.
 */
async function keyOutMagenta(image) {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const count = width * height;

  // Pass 1 — key only what is unmistakably the background.
  const isBackground = new Uint8Array(count);
  for (let p = 0; p < count; p++) {
    const i = p * channels;
    if (data[i] > 235 && data[i + 2] > 235 && data[i + 1] < 45) {
      isBackground[p] = 1;
      // Neutralise the colour too. Magenta left sitting under a zero alpha
      // bleeds back out of any later resample or of the PNG's own filtering.
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }

  // Pass 2 — despill the contaminated band next to the keyed area.
  const radius = 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (isBackground[p]) continue;

      let nearBackground = false;
      for (let dy = -radius; dy <= radius && !nearBackground; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (isBackground[ny * width + nx]) {
            nearBackground = true;
            break;
          }
        }
      }
      if (!nearBackground) continue;

      const i = p * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const spill = Math.min(r, b) - g;
      if (spill <= KEY_TOLERANCE) continue;

      const k = Math.min(1, (spill - KEY_TOLERANCE) / (255 - KEY_TOLERANCE));
      data[i] = Math.round(r - k * (r - g));
      data[i + 2] = Math.round(b - k * (b - g));

      const alpha = data[i + 3] * (1 - k * 0.85);
      data[i + 3] = alpha <= 3 ? 0 : Math.round(alpha);
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png();
}

const files = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (files.length === 0) {
  console.error(`No images found in ${dir}`);
  process.exit(1);
}

if (!dryRun) mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
const skipped = [];

for (const file of files) {
  const id = basename(file, extname(file)).toLowerCase().trim();
  if (!knownIds.has(id)) {
    skipped.push(file);
    continue;
  }

  const source = join(dir, file);
  const magenta = { r: 255, g: 0, b: 255, alpha: 1 };
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };

  // Keying runs last, after every resample. Doing it first lets the resize
  // interpolate the background colour straight back into the subject's edge.
  const fill = keepBackground ? clear : magenta;
  const inner = Math.round(SIZE * (1 - MARGIN * 2));
  const pad = Math.round(SIZE * MARGIN);

  let pipeline = sharp(source)
    // Drop the empty border so every monster fills its frame equally.
    .trim({ background: fill, threshold: keepBackground ? 1 : 12 })
    .resize(inner, inner, { fit: "contain", background: fill })
    .extend({
      top: pad,
      bottom: SIZE - inner - pad,
      left: pad,
      right: SIZE - inner - pad,
      background: fill,
    });

  if (!keepBackground) pipeline = await keyOutMagenta(pipeline);

  const output = await pipeline.png({ compressionLevel: 9 }).toBuffer();

  const target = join(OUT_DIR, `${id}.png`);
  if (dryRun) {
    console.log(`would write ${target}  (${(output.length / 1024).toFixed(0)} kB)`);
  } else {
    await sharp(output).toFile(target);
    console.log(`wrote ${id}.png  (${(output.length / 1024).toFixed(0)} kB)`);
  }
  written++;
}

console.log(`\n${written} sprite(s) ${dryRun ? "ready" : "written"}.`);

if (skipped.length) {
  console.log(
    `\nSkipped ${skipped.length} file(s) whose name did not match a monster id:\n  ` +
      skipped.join("\n  ") +
      "\n\nRename them to match the ids in docs/art-prompts.md and run again.",
  );
}
