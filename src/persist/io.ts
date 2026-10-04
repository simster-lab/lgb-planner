import { POINTS } from "../catalog/lgb";
import { resetPointSerial } from "../editor/pieceFactory";
import type {
  BrokerConfig,
  CatalogSku,
  DccexConfig,
  Hand,
  LayoutDocument,
  LayoutPiece,
  PieceType,
  PointMqttConfig,
  PointState,
  RosterLoco,
  SignalState,
} from "../model/types";
import {
  DEFAULT_RFID_FADE_MS,
  defaultBrokerConfig,
  defaultDccexConfig,
  emptyLayout,
  emptyRosterLoco,
  newPieceId,
} from "../model/types";

const STORAGE_KEY = "lgb-planner-layout";
const ROSTER_STORAGE_KEY = "lgb-planner-roster";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseMqtt(value: unknown): PointMqttConfig | undefined {
  if (!isRecord(value)) return undefined;
  return {
    topic: asString(value.topic),
    payloadThrough: asString(value.payloadThrough, "through"),
    payloadDiverge: asString(value.payloadDiverge, "diverge"),
    payloadDanger: asString(value.payloadDanger, "danger"),
    payloadClear: asString(value.payloadClear, "clear"),
    statusTopic: asString(value.statusTopic),
  };
}

function parseDccex(value: unknown): DccexConfig {
  const defaults = defaultDccexConfig();
  if (!isRecord(value)) return defaults;
  return {
    host: asString(value.host, defaults.host),
    port: asNumber(value.port, defaults.port) || defaults.port,
  };
}

function parseBroker(value: unknown): BrokerConfig {
  const defaults = defaultBrokerConfig();
  if (!isRecord(value)) return defaults;
  return {
    host: asString(value.host, defaults.host),
    port: asNumber(value.port, defaults.port),
    path: asString(value.path, defaults.path),
    username: asString(value.username),
    password: asString(value.password),
    tls: Boolean(value.tls),
    clientId: asString(value.clientId, defaults.clientId),
  };
}

function parsePiece(value: unknown): LayoutPiece | undefined {
  if (!isRecord(value)) return undefined;
  const type = value.type;
  if (
    type !== "straight" &&
    type !== "curve" &&
    type !== "point" &&
    type !== "signal" &&
    type !== "rfid"
  ) {
    return undefined;
  }
  const pieceType = type as PieceType;
  const sku = typeof value.sku === "string" ? (value.sku as CatalogSku) : undefined;
  const hand = value.hand === "left" || value.hand === "right" ? (value.hand as Hand) : undefined;
  const pointState =
    value.pointState === "through" || value.pointState === "diverge"
      ? (value.pointState as PointState)
      : pieceType === "point"
        ? "through"
        : undefined;
  const signalState =
    value.signalState === "danger" || value.signalState === "clear"
      ? (value.signalState as SignalState)
      : pieceType === "signal"
        ? "danger"
        : undefined;

  const defaultMqtt: PointMqttConfig | undefined =
    pieceType === "point"
      ? {
          topic: "",
          payloadThrough: "through",
          payloadDiverge: "diverge",
          statusTopic: "",
        }
      : pieceType === "signal" || pieceType === "rfid"
        ? {
            topic: "",
            payloadThrough: "through",
            payloadDiverge: "diverge",
            payloadDanger: "danger",
            payloadClear: "clear",
            statusTopic: "",
          }
        : undefined;

  return {
    id: asString(value.id, newPieceId()),
    type: pieceType,
    sku,
    lengthMm: pieceType === "straight" ? asNumber(value.lengthMm, 300) : undefined,
    hand: hand ?? (sku && sku in POINTS ? POINTS[sku as keyof typeof POINTS].hand : undefined),
    x: asNumber(value.x, 0),
    y: asNumber(value.y, 0),
    rotationDeg: asNumber(value.rotationDeg, 0),
    name: typeof value.name === "string" ? value.name : undefined,
    showName: value.showName === true ? true : undefined,
    leverInside: value.leverInside === true ? true : undefined,
    pointState,
    signalState,
    hostPieceId: pieceType === "rfid" && typeof value.hostPieceId === "string" ? value.hostPieceId : undefined,
    alongMm: pieceType === "rfid" ? asNumber(value.alongMm, 0) : undefined,
    hostPath: pieceType === "rfid" && typeof value.hostPath === "number" ? value.hostPath : undefined,
    fadeMs: pieceType === "rfid" ? asNumber(value.fadeMs, DEFAULT_RFID_FADE_MS) : undefined,
    nameOpposite: pieceType === "rfid" && value.nameOpposite === true ? true : undefined,
    mqtt:
      pieceType === "point" || pieceType === "signal" || pieceType === "rfid"
        ? parseMqtt(value.mqtt) ?? defaultMqtt
        : undefined,
  };
}

function parseRosterLoco(value: unknown): RosterLoco | undefined {
  if (!isRecord(value)) return undefined;
  const address =
    typeof value.address === "number" && Number.isFinite(value.address)
      ? Math.round(value.address)
      : null;
  return {
    id: asString(value.id, emptyRosterLoco().id),
    address: address != null && address >= 1 && address <= 10239 ? address : null,
    name: asString(value.name),
    tag: asString(value.tag),
  };
}

export function parseRoster(raw: unknown): RosterLoco[] {
  const locosRaw = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.locos)
      ? raw.locos
      : [];
  return locosRaw
    .map(parseRosterLoco)
    .filter((loco): loco is RosterLoco => loco !== undefined);
}

export function parseLayout(raw: unknown): LayoutDocument {
  if (!isRecord(raw)) return emptyLayout();
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const piecesRaw = Array.isArray(raw.pieces) ? raw.pieces : [];
  const pieces = piecesRaw
    .map(parsePiece)
    .filter((piece): piece is LayoutPiece => piece !== undefined);
  resetPointSerial(pieces);
  return {
    version: 1,
    settings: { mqtt: parseBroker(settings.mqtt), dccex: parseDccex(settings.dccex) },
    pieces,
  };
}

export function serializeLayout(layout: LayoutDocument): string {
  return JSON.stringify(layout, null, 2);
}

export function loadAutosave(): LayoutDocument | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return parseLayout(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function writeAutosave(layout: LayoutDocument): void {
  localStorage.setItem(STORAGE_KEY, serializeLayout(layout));
}

export function clearAutosave(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadRosterAutosave(): RosterLoco[] | undefined {
  try {
    const raw = localStorage.getItem(ROSTER_STORAGE_KEY);
    if (!raw) return undefined;
    return parseRoster(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function writeRosterAutosave(locos: RosterLoco[]): void {
  localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ locos }));
}

export function sanitizeCircuitName(raw: string): string | undefined {
  const value = raw.trim().replace(/\.lgb\.json$/i, "").replace(/\.json$/i, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(value)) return undefined;
  return value;
}

export function circuitNameFromFilename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "");
  const cleaned = base
    .replace(/\.lgb\.json$/i, "")
    .replace(/\.json$/i, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return sanitizeCircuitName(cleaned) ?? "layout";
}

export function downloadLayout(layout: LayoutDocument, filename = "layout.lgb.json"): void {
  const blob = new Blob([serializeLayout(layout)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readLayoutFile(file: File): Promise<LayoutDocument> {
  const text = await file.text();
  return parseLayout(JSON.parse(text));
}
