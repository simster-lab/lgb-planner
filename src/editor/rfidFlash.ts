export type RfidFlashOverlay = {
  pieceId: string;
  name: string;
  alpha: number;
};

type Flash = {
  name: string;
  startedAt: number;
  fadeMs: number;
};

const flashes = new Map<string, Flash>();

export function startRfidFlash(pieceId: string, name: string, fadeMs: number): void {
  flashes.set(pieceId, {
    name,
    startedAt: performance.now(),
    fadeMs: Math.max(200, fadeMs),
  });
}

export function rfidFlashOverlays(now = performance.now()): RfidFlashOverlay[] {
  const out: RfidFlashOverlay[] = [];
  for (const [pieceId, flash] of flashes) {
    const t = (now - flash.startedAt) / flash.fadeMs;
    if (t >= 1) {
      flashes.delete(pieceId);
      continue;
    }
    out.push({ pieceId, name: flash.name, alpha: 1 - t });
  }
  return out;
}

export function lookupRosterName(
  tag: string,
  roster: { name: string; tag: string }[],
): string {
  const needle = tag.trim();
  if (!needle) return "";
  const match = roster.find((loco) => loco.tag.trim() === needle);
  const name = match?.name.trim();
  return name || needle;
}
