import type {
  CatalogSku,
  CurveSku,
  Hand,
  LayoutPiece,
  LocalPort,
  PointSku,
  SignalSku,
} from "../model/types";

export const GAUGE_MM = 45;
export const RAIL_OFFSET = GAUGE_MM / 2;
export const TIE_SPACING_MM = 28;
export const TIE_LENGTH_MM = 82;
export const TIE_WIDTH_MM = 10;

export const R1_RADIUS_MM = 600;
export const R2_RADIUS_MM = 778;
export const R3_RADIUS_MM = 1198;

export const SNAP_PLACE_MM = 70;
export const SNAP_CONNECT_MM = 8;
export const HEADING_TOLERANCE_DEG = 14;
export const SIGNAL_OFFSET_MM = 80;
export const SIGNAL_SNAP_MM = 120;

export interface CurveSpec {
  sku: CurveSku;
  label: string;
  radiusMm: number;
  angleDeg: number;
}

export interface PointSpec {
  sku: PointSku;
  label: string;
  hand: Hand;
  radiusMm: number;
  angleDeg: number;
  throughMm: number;
}

export const CURVES: Record<CurveSku, CurveSpec> = {
  "11000": {
    sku: "11000",
    label: "R1 curve 30°",
    radiusMm: R1_RADIUS_MM,
    angleDeg: 30,
  },
  "15000": {
    sku: "15000",
    label: "R2 curve 30°",
    radiusMm: R2_RADIUS_MM,
    angleDeg: 30,
  },
  "16000": {
    sku: "16000",
    label: "R3 curve 22.5°",
    radiusMm: R3_RADIUS_MM,
    angleDeg: 22.5,
  },
};

export const POINTS: Record<PointSku, PointSpec> = {
  "12000": {
    sku: "12000",
    label: "R1 right point",
    hand: "right",
    radiusMm: R1_RADIUS_MM,
    angleDeg: 30,
    throughMm: 300,
  },
  "12100": {
    sku: "12100",
    label: "R1 left point",
    hand: "left",
    radiusMm: R1_RADIUS_MM,
    angleDeg: 30,
    throughMm: 300,
  },
  "16040": {
    sku: "16040",
    label: "R3 right point",
    hand: "right",
    radiusMm: R3_RADIUS_MM,
    angleDeg: 22.5,
    throughMm: 440,
  },
  "16140": {
    sku: "16140",
    label: "R3 left point",
    hand: "left",
    radiusMm: R3_RADIUS_MM,
    angleDeg: 22.5,
    throughMm: 440,
  },
};

export function isCurveSku(sku: string | undefined): sku is CurveSku {
  return sku === "11000" || sku === "15000" || sku === "16000";
}

export function isPointSku(sku: string | undefined): sku is PointSku {
  return sku === "12000" || sku === "12100" || sku === "16040" || sku === "16140";
}

export interface SignalSpec {
  sku: SignalSku;
  label: string;
  kind: "semaphore" | "colour-light";
}

export const SIGNALS: Record<SignalSku, SignalSpec> = {
  "sema-2": { sku: "sema-2", label: "Semaphore 2-aspect", kind: "semaphore" },
  "light-2": { sku: "light-2", label: "Colour-light 2-aspect", kind: "colour-light" },
};

export function isSignalSku(sku: string | undefined): sku is SignalSku {
  return sku === "sema-2" || sku === "light-2";
}

export function signalSpec(sku: CatalogSku | undefined): SignalSpec | undefined {
  return isSignalSku(sku) ? SIGNALS[sku] : undefined;
}

export function curveSpec(sku: CatalogSku | undefined): CurveSpec | undefined {
  return isCurveSku(sku) ? CURVES[sku] : undefined;
}

export function pointSpec(sku: CatalogSku | undefined): PointSpec | undefined {
  return isPointSku(sku) ? POINTS[sku] : undefined;
}

export function flippedPointSku(sku: PointSku): PointSku {
  const map: Record<PointSku, PointSku> = {
    "12000": "12100",
    "12100": "12000",
    "16040": "16140",
    "16140": "16040",
  };
  return map[sku];
}

export function pieceLabel(piece: LayoutPiece): string {
  if (piece.name?.trim()) return piece.name.trim();
  if (piece.type === "straight") {
    return `Straight ${Math.round(piece.lengthMm ?? 300)} mm`;
  }
  if (piece.type === "curve") {
    const spec = curveSpec(piece.sku);
    return spec ? spec.label : "Curve";
  }
  if (piece.type === "signal") {
    const spec = signalSpec(piece.sku);
    return spec ? spec.label : "Signal";
  }
  const spec = pointSpec(piece.sku);
  return spec ? spec.label : "Point";
}

export function localArcPoint(radiusMm: number, angleRad: number, hand: Hand): {
  x: number;
  y: number;
} {
  const sign = hand === "left" ? -1 : 1;
  return {
    x: radiusMm * Math.sin(angleRad),
    y: sign * radiusMm * (1 - Math.cos(angleRad)),
  };
}

export function localPorts(piece: LayoutPiece): LocalPort[] {
  if (piece.type === "signal") return [];

  if (piece.type === "straight") {
    const length = Math.max(1, piece.lengthMm ?? 300);
    return [
      { portId: "a", x: 0, y: 0, heading: 180 },
      { portId: "b", x: length, y: 0, heading: 0 },
    ];
  }

  if (piece.type === "curve") {
    const spec = curveSpec(piece.sku);
    if (!spec) return [];
    const hand = piece.hand ?? "left";
    const theta = (spec.angleDeg * Math.PI) / 180;
    const end = localArcPoint(spec.radiusMm, theta, hand);
    const endHeading = hand === "left" ? -spec.angleDeg : spec.angleDeg;
    return [
      { portId: "a", x: 0, y: 0, heading: 180 },
      { portId: "b", x: end.x, y: end.y, heading: endHeading },
    ];
  }

  const spec = pointSpec(piece.sku);
  if (!spec) return [];
  const hand = piece.hand ?? spec.hand;
  const theta = (spec.angleDeg * Math.PI) / 180;
  const diverge = localArcPoint(spec.radiusMm, theta, hand);
  const divergeHeading = hand === "left" ? -spec.angleDeg : spec.angleDeg;
  return [
    { portId: "a", x: 0, y: 0, heading: 180 },
    { portId: "through", x: spec.throughMm, y: 0, heading: 0 },
    { portId: "diverge", x: diverge.x, y: diverge.y, heading: divergeHeading },
  ];
}
