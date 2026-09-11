import {
  curveSpec,
  flippedPointSku,
  isPointSku,
  pointSpec,
  signalSpec,
} from "../catalog/lgb";
import type { Hand, LayoutPiece, Placing } from "../model/types";
import { newPieceId } from "../model/types";

let pointSerial = 1;
let signalSerial = 1;

export function resetPointSerial(pieces: LayoutPiece[]): void {
  let maxPoint = 0;
  let maxSignal = 0;
  for (const piece of pieces) {
    const pointMatch = /^Point (\d+)$/.exec(piece.name ?? "");
    if (pointMatch) maxPoint = Math.max(maxPoint, Number(pointMatch[1]));
    const signalMatch = /^Signal (\d+)$/.exec(piece.name ?? "");
    if (signalMatch) maxSignal = Math.max(maxSignal, Number(signalMatch[1]));
  }
  pointSerial = maxPoint + 1;
  signalSerial = maxSignal + 1;
}

export function createPlacedPiece(
  placing: Placing,
  x: number,
  y: number,
  rotationDeg: number,
  options?: { id?: string; preview?: boolean },
): LayoutPiece {
  const id = options?.id ?? (options?.preview ? "ghost" : newPieceId());
  if (placing.type === "straight") {
    return {
      id,
      type: "straight",
      lengthMm: Math.max(1, placing.lengthMm ?? 300),
      x,
      y,
      rotationDeg,
    };
  }

  if (placing.type === "curve") {
    const spec = curveSpec(placing.sku);
    return {
      id,
      type: "curve",
      sku: spec?.sku ?? "15000",
      hand: placing.hand ?? "left",
      x,
      y,
      rotationDeg,
    };
  }

  if (placing.type === "signal") {
    const spec = signalSpec(placing.sku);
    return {
      id,
      type: "signal",
      sku: spec?.sku ?? "sema-2",
      hand: placing.hand ?? "right",
      name: options?.preview ? "Signal" : `Signal ${signalSerial++}`,
      signalState: "danger",
      mqtt: {
        topic: "",
        payloadThrough: "through",
        payloadDiverge: "diverge",
        payloadDanger: "danger",
        payloadClear: "clear",
        statusTopic: "",
      },
      x,
      y,
      rotationDeg,
    };
  }

  const spec = pointSpec(placing.sku);
  return {
    id,
    type: "point",
    sku: spec?.sku ?? "12100",
    hand: placing.hand ?? spec?.hand ?? "left",
    name: options?.preview ? "Point" : `Point ${pointSerial++}`,
    pointState: "through",
    mqtt: {
      topic: "",
      payloadThrough: "through",
      payloadDiverge: "diverge",
      statusTopic: "",
    },
    x,
    y,
    rotationDeg,
  };
}

export function flipPiece(piece: LayoutPiece): LayoutPiece {
  if (piece.type === "straight") return piece;

  if (piece.type === "curve") {
    const nextHand: Hand = piece.hand === "right" ? "left" : "right";
    return { ...piece, hand: nextHand };
  }

  if (piece.type === "signal") return piece;

  if (!isPointSku(piece.sku)) return piece;
  const nextSku = flippedPointSku(piece.sku);
  const spec = pointSpec(nextSku);
  return { ...piece, sku: nextSku, hand: spec?.hand };
}

export function placingFromPiece(piece: LayoutPiece): Placing {
  return {
    type: piece.type,
    sku: piece.sku,
    lengthMm: piece.lengthMm,
    hand: piece.hand,
  };
}
