import type { BrokerConfig } from "./model/types";

let runtimeDefaults: Partial<BrokerConfig> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function loadRuntimeConfig(): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);
    const response = await fetch("/config.json", { cache: "no-store", signal: controller.signal });
    window.clearTimeout(timer);
    if (!response.ok) return;
    const data: unknown = await response.json();
    if (!isRecord(data)) return;
    const next: Partial<BrokerConfig> = {};
    if (typeof data.host === "string" && data.host.trim()) next.host = data.host.trim();
    if (typeof data.port === "number" && Number.isFinite(data.port)) next.port = data.port;
    if (typeof data.port === "string" && data.port.trim()) {
      const parsed = Number(data.port);
      if (Number.isFinite(parsed)) next.port = parsed;
    }
    if (typeof data.path === "string" && data.path.trim()) next.path = data.path.trim();
    if (typeof data.username === "string") next.username = data.username;
    if (typeof data.password === "string") next.password = data.password;
    if (typeof data.tls === "boolean") next.tls = data.tls;
    runtimeDefaults = next;
  } catch {
    runtimeDefaults = {};
  }
}

export function runtimeBrokerDefaults(): Partial<BrokerConfig> {
  return runtimeDefaults;
}
