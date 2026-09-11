import { createPlacedPiece } from "../src/editor/pieceFactory.ts";
import { ghostAt, freePorts, poseBesideTrack, recomputeConnections } from "../src/editor/snap.ts";
import { worldPorts } from "../src/model/geometry.ts";
import { parseLayout, serializeLayout, circuitNameFromFilename, sanitizeCircuitName } from "../src/persist/io.ts";
import type { LayoutPiece, Placing } from "../src/model/types.ts";

const placing: Placing = { type: "curve", sku: "15000", hand: "left" };
const pieces: LayoutPiece[] = [createPlacedPiece(placing, 0, 0, 0)];

for (let i = 0; i < 11; i += 1) {
  const lastPiece = pieces[pieces.length - 1];
  const target =
    freePorts(pieces).find((port) => port.portId === "b" && port.pieceId === lastPiece.id) ??
    freePorts(pieces)[0];
  const ghost = ghostAt(placing, pieces, target.x, target.y);
  pieces.push(createPlacedPiece(placing, ghost.x, ghost.y, ghost.rotationDeg));
}

const first = worldPorts(pieces[0]).find((port) => port.portId === "a");
const last = worldPorts(pieces[11]).find((port) => port.portId === "b");
if (!first || !last) throw new Error("missing end ports");
const gap = Math.hypot(first.x - last.x, first.y - last.y);
const connections = recomputeConnections(pieces);
const free = freePorts(pieces);

console.log({
  pieces: pieces.length,
  connections: connections.length,
  free: free.length,
  gap: Number(gap.toFixed(3)),
});

if (pieces.length !== 12) throw new Error("expected 12 R2 curves");
if (connections.length !== 12) throw new Error(`expected a closed loop of 12 joins, got ${connections.length}`);
if (gap > 2) throw new Error(`R2 loop did not close: gap ${gap}`);
if (free.length !== 0) throw new Error("closed loop should have no free ports");

const point = createPlacedPiece({ type: "point", sku: "12100", hand: "left" }, 500, 0, 0);
const layout = parseLayout({
  version: 1,
  settings: {
    mqtt: {
      host: "broker.local",
      port: 9001,
      path: "/mqtt",
      username: "",
      password: "",
      tls: false,
      clientId: "t",
    },
  },
  pieces: [
    ...pieces,
    {
      ...point,
      name: "Yard 1",
      mqtt: { topic: "p/1", payloadThrough: "0", payloadDiverge: "1" },
    },
  ],
});
const roundtrip = parseLayout(JSON.parse(serializeLayout(layout)));
const savedPoint = roundtrip.pieces.find((piece) => piece.type === "point");
if (savedPoint?.name !== "Yard 1" || savedPoint.mqtt?.topic !== "p/1") {
  throw new Error("MQTT/name roundtrip failed");
}
if (roundtrip.settings.mqtt?.host !== "broker.local") {
  throw new Error("broker settings roundtrip failed");
}

const siding = createPlacedPiece({ type: "point", sku: "12100", hand: "left" }, 0, 0, 0);
const through = worldPorts(siding).find((port) => port.portId === "through");
const diverge = worldPorts(siding).find((port) => port.portId === "diverge");
if (!through || !diverge) throw new Error("point ports missing");
if (Math.abs(through.x - 300) > 0.01) throw new Error("R1 through should be 300 mm");
if (Math.abs(diverge.x - 300) > 1) throw new Error("R1 diverge x should match 300 mm");

const signal = createPlacedPiece({ type: "signal", sku: "sema-2", hand: "right" }, 100, 80, 180);
const withSignal = parseLayout({
  ...layout,
  pieces: [...layout.pieces, { ...signal, name: "Home 1", mqtt: { ...signal.mqtt, topic: "s/1", payloadDanger: "0", payloadClear: "1" } }],
});
const savedSignal = parseLayout(JSON.parse(serializeLayout(withSignal))).pieces.find(
  (piece) => piece.type === "signal",
);
if (savedSignal?.name !== "Home 1" || savedSignal.mqtt?.payloadClear !== "1") {
  throw new Error("signal MQTT roundtrip failed");
}

if (circuitNameFromFilename("yard.lgb.json") !== "yard") throw new Error("filename stem");
if (sanitizeCircuitName("../etc") || sanitizeCircuitName("a/b")) {
  throw new Error("unsafe circuit name");
}

const eastWest = [createPlacedPiece({ type: "straight", lengthMm: 300 }, 0, 0, 0)];
const above = poseBesideTrack(150, 0, eastWest);
if (!above || above.rotationDeg !== 0 || above.y >= 0) {
  throw new Error("signal on east-west track should stand upright above the rails");
}
const northSouth = [createPlacedPiece({ type: "straight", lengthMm: 300 }, 0, 0, 90)];
const right = poseBesideTrack(0, 150, northSouth);
if (!right || right.rotationDeg !== 0 || right.x <= 0) {
  throw new Error("signal on north-south track should stand upright to the right");
}

console.log("geometry and persist checks passed");
