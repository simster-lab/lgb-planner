import { useEffect, useState } from "react";

const MAX_LINES = 14;
let lines: string[] = [];
const listeners = new Set<() => void>();

export function placeDebugOn(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

export function placeDebug(message: string): void {
  if (!placeDebugOn()) return;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, "0")}`;
  lines = [`${stamp} ${message}`, ...lines].slice(0, MAX_LINES);
  for (const listener of listeners) listener();
}

export function usePlaceDebugLog(): string[] {
  const [log, setLog] = useState(lines);
  useEffect(() => {
    const onChange = () => setLog([...lines]);
    listeners.add(onChange);
    onChange();
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return log;
}
