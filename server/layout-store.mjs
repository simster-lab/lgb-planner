import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || join(ROOT, "..", "data");

function layoutsDir() {
  return join(DATA_DIR, "layouts");
}

function currentLayoutPath() {
  return join(DATA_DIR, "current.lgb.json");
}

function currentMetaPath() {
  return join(DATA_DIR, "current.json");
}

function namedPath(name) {
  return join(layoutsDir(), `${name}.lgb.json`);
}

export function ensureDataDir() {
  mkdirSync(layoutsDir(), { recursive: true });
}

export function sanitizeCircuitName(raw) {
  const value = String(raw ?? "")
    .trim()
    .replace(/\.lgb\.json$/i, "")
    .replace(/\.json$/i, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(value)) return undefined;
  return value;
}

export function isLayoutDocument(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.pieces));
}

export function readMeta() {
  try {
    const raw = JSON.parse(readFileSync(currentMetaPath(), "utf8"));
    return { name: sanitizeCircuitName(raw?.name) ?? null };
  } catch {
    return { name: null };
  }
}

export function writeMeta(name) {
  ensureDataDir();
  writeFileSync(currentMetaPath(), `${JSON.stringify({ name: name ?? null }, null, 2)}\n`);
}

export function readCurrent() {
  if (!existsSync(currentLayoutPath())) return undefined;
  return JSON.parse(readFileSync(currentLayoutPath(), "utf8"));
}

export function writeCurrent(layout, name) {
  ensureDataDir();
  writeFileSync(currentLayoutPath(), `${JSON.stringify(layout, null, 2)}\n`);
  if (name !== undefined) writeMeta(name ? sanitizeCircuitName(name) ?? null : null);
}

export function listNamed() {
  ensureDataDir();
  return readdirSync(layoutsDir())
    .filter((file) => file.endsWith(".lgb.json"))
    .map((file) => file.slice(0, -".lgb.json".length))
    .filter((name) => sanitizeCircuitName(name))
    .sort((a, b) => a.localeCompare(b));
}

export function namedExists(name) {
  return existsSync(namedPath(name));
}

export function readNamed(name) {
  const file = namedPath(name);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeNamed(name, layout) {
  ensureDataDir();
  writeFileSync(namedPath(name), `${JSON.stringify(layout, null, 2)}\n`);
  writeCurrent(layout, name);
}

export function deleteNamed(name) {
  const file = namedPath(name);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  if (readMeta().name === name) writeMeta(null);
  return true;
}
