import { runtimeBrokerDefaults } from "../config";

export type EditorMode = "plan" | "run";

export type PieceType = "straight" | "curve" | "point" | "signal" | "rfid";

export type CurveSku = "11000" | "15000" | "16000";
export type PointSku = "12000" | "12100" | "16040" | "16140";
export type SignalSku = "sema-2" | "light-2";
export type CatalogSku = CurveSku | PointSku | SignalSku;

export type Hand = "left" | "right";
export type PointState = "through" | "diverge";
export type SignalState = "danger" | "clear";
export type PortId = "a" | "b" | "through" | "diverge";

export type MqttConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface Vec2 {
  x: number;
  y: number;
}

export interface WorldPort {
  pieceId: string;
  portId: PortId;
  x: number;
  y: number;
  heading: number;
}

export interface LocalPort {
  portId: PortId;
  x: number;
  y: number;
  heading: number;
}

export interface BrokerConfig {
  host: string;
  port: number;
  path: string;
  username: string;
  password: string;
  tls: boolean;
  clientId: string;
}

export interface DccexConfig {
  host: string;
  port: number;
}

export interface PointMqttConfig {
  topic: string;
  payloadThrough: string;
  payloadDiverge: string;
  payloadDanger?: string;
  payloadClear?: string;
  statusTopic?: string;
}

export interface RosterLoco {
  id: string;
  address: number | null;
  name: string;
  tag: string;
}

export const DEFAULT_RFID_FADE_MS = 5000;

export interface LayoutPiece {
  id: string;
  type: PieceType;
  sku?: CatalogSku;
  lengthMm?: number;
  hand?: Hand;
  x: number;
  y: number;
  rotationDeg: number;
  name?: string;
  showName?: boolean;
  leverInside?: boolean;
  pointState?: PointState;
  signalState?: SignalState;
  hostPieceId?: string;
  alongMm?: number;
  hostPath?: number;
  fadeMs?: number;
  nameOpposite?: boolean;
  mqtt?: PointMqttConfig;
}

export interface LayoutDocument {
  version: 1;
  settings: {
    mqtt?: BrokerConfig;
    dccex?: DccexConfig;
  };
  pieces: LayoutPiece[];
}

export interface Placing {
  type: PieceType;
  sku?: CatalogSku;
  lengthMm?: number;
  hand?: Hand;
  rotationDeg?: number;
  snapCycle?: number;
}

export interface ViewState {
  panX: number;
  panY: number;
  zoom: number;
}

export function defaultDccexConfig(): DccexConfig {
  return { host: "", port: 2560 };
}

export function defaultBrokerConfig(): BrokerConfig {
  const runtime = runtimeBrokerDefaults();
  return {
    host: runtime.host || "localhost",
    port: runtime.port ?? 1883,
    path: runtime.path || "/mqtt",
    username: runtime.username ?? "",
    password: runtime.password ?? "",
    tls: runtime.tls ?? false,
    clientId: `lgb-planner-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export function emptyLayout(): LayoutDocument {
  return {
    version: 1,
    settings: { mqtt: defaultBrokerConfig(), dccex: defaultDccexConfig() },
    pieces: [],
  };
}

export function isTrackPiece(piece: Pick<LayoutPiece, "type">): boolean {
  return piece.type === "straight" || piece.type === "curve" || piece.type === "point";
}

let pieceIdSerial = 0;
let rosterIdSerial = 0;

export function newPieceId(): string {
  pieceIdSerial += 1;
  return `p-${pieceIdSerial}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newRosterId(): string {
  rosterIdSerial += 1;
  return `loco-${rosterIdSerial}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyRosterLoco(): RosterLoco {
  return { id: newRosterId(), address: null, name: "", tag: "" };
}
