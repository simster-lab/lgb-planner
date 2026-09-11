import { runtimeBrokerDefaults } from "../config";

export type PieceType = "straight" | "curve" | "point" | "signal";

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

export interface PointMqttConfig {
  topic: string;
  payloadThrough: string;
  payloadDiverge: string;
  payloadDanger?: string;
  payloadClear?: string;
  statusTopic?: string;
}

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
  pointState?: PointState;
  signalState?: SignalState;
  mqtt?: PointMqttConfig;
}

export interface LayoutDocument {
  version: 1;
  settings: {
    mqtt?: BrokerConfig;
  };
  pieces: LayoutPiece[];
}

export interface Placing {
  type: PieceType;
  sku?: CatalogSku;
  lengthMm?: number;
  hand?: Hand;
}

export interface ViewState {
  panX: number;
  panY: number;
  zoom: number;
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
    settings: { mqtt: defaultBrokerConfig() },
    pieces: [],
  };
}

let pieceIdSerial = 0;

export function newPieceId(): string {
  pieceIdSerial += 1;
  return `p-${pieceIdSerial}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
