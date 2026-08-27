import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { PlayerIndex } from "@mm/engine";

/**
 * Authentication for a fixed pair of accounts.
 *
 * No registration, no email, no reset flow: two passphrases generated at
 * install time, and a signed cookie. For a game only two people will ever use,
 * anything more is machinery without a purpose.
 */

const SESSION_DAYS = 120;
export const COOKIE_NAME = "mm_session";

export function hashPassphrase(passphrase: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(passphrase.normalize("NFKC"), salt, 32);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassphrase(passphrase: string, stored: string): boolean {
  const [saltHex, expectedHex] = stored.split(":");
  if (!saltHex || !expectedHex) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }

  const derived = scryptSync(passphrase.normalize("NFKC"), Buffer.from(saltHex, "hex"), expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueSession(index: PlayerIndex, secret: string): string {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${index}.${expires}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function readSession(token: string | undefined, secret: string): PlayerIndex | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [indexRaw, expiresRaw, providedSig] = parts as [string, string, string];
  const payload = `${indexRaw}.${expiresRaw}`;
  const expectedSig = sign(payload, secret);

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;

  const index = Number(indexRaw);
  return index === 0 || index === 1 ? (index as PlayerIndex) : null;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionCookie(token: string, secure: boolean): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

/** Readable passphrase: four words plus digits. Generated once at install. */
const WORDS = [
  "amber", "anchor", "basalt", "bramble", "cinder", "clover", "cobalt", "copper",
  "dapple", "ember", "fathom", "ferrous", "flint", "garnet", "gossamer", "harbor",
  "indigo", "juniper", "kindle", "lantern", "lichen", "marrow", "meadow", "nimbus",
  "onyx", "orchard", "pebble", "quarry", "quill", "ripple", "saffron", "sable",
  "thistle", "tundra", "umber", "verdant", "willow", "zephyr",
];

export function generatePassphrase(): string {
  const picks: string[] = [];
  const bytes = randomBytes(4);
  for (let i = 0; i < 4; i++) picks.push(WORDS[bytes[i]! % WORDS.length]!);
  const digits = String(randomBytes(2).readUInt16BE(0) % 100).padStart(2, "0");
  return `${picks.join("-")}-${digits}`;
}
