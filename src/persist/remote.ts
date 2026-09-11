import type { LayoutDocument } from "../model/types";
import { parseLayout } from "./io";

export type CircuitPayload = { layout: LayoutDocument; name: string | null };

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  return JSON.parse(text);
}

function asPayload(raw: unknown): CircuitPayload | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as { layout?: unknown; name?: unknown; pieces?: unknown };
  if (Array.isArray(record.pieces)) {
    return { layout: parseLayout(record), name: null };
  }
  if (record.layout) {
    const name = typeof record.name === "string" ? record.name : null;
    return { layout: parseLayout(record.layout), name };
  }
  return undefined;
}

export async function fetchCurrentCircuit(): Promise<CircuitPayload | "missing" | "offline"> {
  try {
    const response = await fetch("/api/layout", { cache: "no-store" });
    if (response.status === 404) return "missing";
    if (!response.ok) return "offline";
    return asPayload(await readJson(response)) ?? "missing";
  } catch {
    return "offline";
  }
}

export async function saveCurrentCircuit(layout: LayoutDocument, name: string | null): Promise<boolean> {
  try {
    const response = await fetch("/api/layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout, name }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function listCircuits(): Promise<string[] | undefined> {
  try {
    const response = await fetch("/api/layouts", { cache: "no-store" });
    if (!response.ok) return undefined;
    const data = (await readJson(response)) as { names?: unknown };
    return Array.isArray(data?.names) ? data.names.map(String) : [];
  } catch {
    return undefined;
  }
}

export async function loadNamedCircuit(name: string): Promise<CircuitPayload | undefined> {
  try {
    const response = await fetch(`/api/layouts/${encodeURIComponent(name)}`, { cache: "no-store" });
    if (!response.ok) return undefined;
    return asPayload(await readJson(response));
  } catch {
    return undefined;
  }
}

export async function saveNamedCircuit(name: string, layout: LayoutDocument): Promise<boolean> {
  try {
    const response = await fetch(`/api/layouts/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteNamedCircuit(name: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/layouts/${encodeURIComponent(name)}`, { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function importCircuit(name: string, layout: LayoutDocument): Promise<CircuitPayload | undefined> {
  try {
    const response = await fetch("/api/layouts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout, name }),
    });
    if (!response.ok) return undefined;
    return asPayload(await readJson(response)) ?? { layout, name };
  } catch {
    return undefined;
  }
}
