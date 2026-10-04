import { TIE_LENGTH_MM } from "../src/catalog/lgb.ts";
import { liveSections } from "../src/editor/liveRoutes.ts";
import { createPlacedPiece, flipPiece, flipPlacing } from "../src/editor/pieceFactory.ts";
import { hitTestLever, leverKnobWorld, leverLocal, leverOutward, leverScale, leverSideSign, rfidNameSide } from "../src/editor/render.ts";
import { attachPortFor, cyclePlacingSnap, ghostAt, freePorts, placingAttachPorts, poseBesideTrack, recomputeConnections } from "../src/editor/snap.ts";
import { clonePieces, piecesAt, piecesRelativeToCenter, rotatePieces, selectionCenter } from "../src/editor/selection.ts";
import { worldPorts } from "../src/model/geometry.ts";
import { parseLayout, parseRoster, serializeLayout, circuitNameFromFilename, sanitizeCircuitName } from "../src/persist/io.ts";
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
    dccex: { host: "10.0.0.8", port: 2560 },
  },
  pieces: [
    ...pieces,
    {
      ...point,
      name: "Yard 1",
      showName: true,
      leverInside: true,
      mqtt: { topic: "p/1", payloadThrough: "0", payloadDiverge: "1" },
    },
  ],
});
const roundtrip = parseLayout(JSON.parse(serializeLayout(layout)));
const savedPoint = roundtrip.pieces.find((piece) => piece.type === "point");
if (
  savedPoint?.name !== "Yard 1" ||
  savedPoint.showName !== true ||
  savedPoint.leverInside !== true ||
  savedPoint.mqtt?.topic !== "p/1"
) {
  throw new Error("MQTT/name roundtrip failed");
}
if (roundtrip.settings.mqtt?.host !== "broker.local") {
  throw new Error("broker settings roundtrip failed");
}
if (roundtrip.settings.dccex?.host !== "10.0.0.8" || roundtrip.settings.dccex.port !== 2560) {
  throw new Error("DCC-EX settings roundtrip failed");
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

const turnout = createPlacedPiece({ type: "point", sku: "12100", hand: "left" }, 800, 0, 0);
const straightPlacing: Placing = { type: "straight", lengthMm: 300 };
function placeOnPort(pieces: LayoutPiece[], pieceId: string, portId: "a" | "through" | "diverge"): LayoutPiece {
  const target = worldPorts(pieces.find((item) => item.id === pieceId)!).find((port) => port.portId === portId);
  if (!target) throw new Error(`missing port ${portId}`);
  const ghost = ghostAt(straightPlacing, pieces, target.x, target.y);
  return createPlacedPiece(straightPlacing, ghost.x, ghost.y, ghost.rotationDeg);
}
const stock = placeOnPort([turnout], turnout.id, "a");
const thruRoad = placeOnPort([turnout, stock], turnout.id, "through");
const divRoad = placeOnPort([turnout, stock, thruRoad], turnout.id, "diverge");
const yard = [
  { ...turnout, pointState: "through" as const },
  stock,
  thruRoad,
  divRoad,
];
const throughLive = liveSections(yard);
const divergeLive = liveSections(
  yard.map((piece) => (piece.id === turnout.id ? { ...piece, pointState: "diverge" as const } : piece)),
);
if (throughLive.length !== 2 || divergeLive.length !== 2) {
  throw new Error(`expected 2 live sections per throw, got ${throughLive.length}/${divergeLive.length}`);
}
const throughHasPoint = throughLive.some((section) =>
  section.paths.some((path) => path.some((p) => Math.hypot(p.x - turnout.x, p.y - turnout.y) < 5)),
);
if (!throughHasPoint) throw new Error("through live section should include the point centre-line");

const flippedCurve = flipPlacing({ type: "curve", sku: "15000", hand: "left" });
if (flippedCurve.hand !== "right") throw new Error("F should flip a curve before it is placed");
if (flipPlacing(flippedCurve).hand !== "left") throw new Error("F should toggle curve hand back");

const rotatedPlace = flipPlacing({ type: "straight", lengthMm: 300, rotationDeg: 0 });
if (rotatedPlace.rotationDeg !== 90) throw new Error("F should rotate a straight 90° before it is placed");

const east = createPlacedPiece({ type: "straight", lengthMm: 300 }, 0, 0, 0);
const north = flipPiece(east);
if (Math.abs(north.rotationDeg - 90) > 0.01) throw new Error("placed straight should rotate 90°");
const eastMid = { x: 150, y: 0 };
const northMid = { x: north.x + 150 * Math.cos((north.rotationDeg * Math.PI) / 180), y: north.y + 150 * Math.sin((north.rotationDeg * Math.PI) / 180) };
if (Math.hypot(northMid.x - eastMid.x, northMid.y - eastMid.y) > 0.5) {
  throw new Error("straight 90° rotate should keep the midpoint");
}

const pointPlace: Placing = { type: "point", sku: "12100", hand: "left" };
const pointJoins = placingAttachPorts(pointPlace).map((port) => port.portId);
if (pointJoins.join(",") !== "a,through,diverge") {
  throw new Error(`point should have 3 snap ends, got ${pointJoins.join(",")}`);
}
const throughPlace = cyclePlacingSnap(pointPlace, 1);
const divergePlace = cyclePlacingSnap(throughPlace, 1);
const backToStock = cyclePlacingSnap(divergePlace, 1);
if (attachPortFor(throughPlace)?.portId !== "through") throw new Error("D should select the through joiner");
if (attachPortFor(divergePlace)?.portId !== "diverge") throw new Error("D again should select the diverge joiner");
if (attachPortFor(backToStock)?.portId !== "a") throw new Error("D should wrap back to stock");
const run = createPlacedPiece({ type: "straight", lengthMm: 300 }, 0, 0, 0);
const stockGhost = ghostAt(pointPlace, [run], 300, 0);
const divergeGhost = ghostAt(divergePlace, [run], 300, 0);
if (
  Math.hypot(stockGhost.x - divergeGhost.x, stockGhost.y - divergeGhost.y) < 1 &&
  Math.abs(stockGhost.rotationDeg - divergeGhost.rotationDeg) < 1
) {
  throw new Error("snapping a point through diverge should pose it differently than stock");
}

const groupA = createPlacedPiece({ type: "straight", lengthMm: 300 }, 0, 0, 0);
const groupB = createPlacedPiece({ type: "straight", lengthMm: 300 }, 300, 0, 0);
const turned = rotatePieces([groupA, groupB], 90);
const turnedLeft = turned.find((piece) => piece.id === groupA.id);
const turnedRight = turned.find((piece) => piece.id === groupB.id);
if (!turnedLeft || !turnedRight) throw new Error("rotate should keep piece ids");
if (Math.abs(turnedLeft.rotationDeg - 90) > 0.01 || Math.abs(turnedRight.rotationDeg - 90) > 0.01) {
  throw new Error("group rotate should add 90° to each piece");
}
if (Math.hypot(turnedLeft.x - turnedRight.x, turnedLeft.y - turnedRight.y) < 200) {
  throw new Error("group rotate should keep pieces apart");
}
const copies = clonePieces([groupA, groupB]);
if (copies.length !== 2) throw new Error("paste should clone the selection");
if (copies.some((piece) => piece.id === groupA.id || piece.id === groupB.id)) {
  throw new Error("pasted pieces need new ids");
}
const relative = piecesRelativeToCenter([groupA, groupB]);
const dropped = piecesAt(relative, { x: 1000, y: 500 });
if (Math.abs(dropped[0].x - dropped[1].x) < 200) {
  throw new Error("paste ghost should keep group spacing");
}
const dropCenter = selectionCenter(dropped);
if (Math.hypot(dropCenter.x - 1000, dropCenter.y - 500) > 1) {
  throw new Error("paste group should sit on the cursor");
}

for (const sku of ["12100", "12000", "16140", "16040"] as const) {
  const turnout = createPlacedPiece({ type: "point", sku, hand: sku === "12000" || sku === "16040" ? "right" : "left" }, 0, 0, 0);
  for (const zoom of [1, 0.55, 0.12]) {
    const local = leverLocal(turnout, zoom);
    if (!local) throw new Error(`lever missing for ${sku}`);
    const inward = Math.abs(local.y) - 12 * leverScale(zoom);
    if (inward < TIE_LENGTH_MM / 2 + 8) {
      throw new Error(`lever overlaps ${sku} sleepers at zoom ${zoom}: inward ${inward.toFixed(1)}`);
    }
    if (Math.sign(local.y) !== leverOutward(turnout)) {
      throw new Error(`lever for ${sku} should sit outside the diverge`);
    }
    const inside = leverLocal({ ...turnout, leverInside: true }, zoom);
    if (!inside || Math.sign(inside.y) !== leverSideSign({ ...turnout, leverInside: true })) {
      throw new Error(`inside lever for ${sku} should sit on the diverge side`);
    }
    if (Math.sign(inside.y) === Math.sign(local.y)) {
      throw new Error(`inside lever for ${sku} should flip side`);
    }
    const knob = leverKnobWorld(turnout, zoom, 0);
    if (!knob) throw new Error(`lever knob missing for ${sku}`);
    if (hitTestLever(turnout, knob, zoom)) {
      throw new Error(`plan lever hit for ${sku} should stay near the pivot at zoom ${zoom}`);
    }
    if (!hitTestLever(turnout, knob, zoom, { alongLever: true, anim: 0 })) {
      throw new Error(`run lever hit for ${sku} should include the knob at zoom ${zoom}`);
    }
  }
}

const rfidHost = createPlacedPiece({ type: "straight", lengthMm: 300 }, 0, 0, 0);
const rfidGhost = ghostAt({ type: "rfid" }, [rfidHost], 150, 0);
if (rfidGhost.type !== "rfid" || rfidGhost.hostPieceId !== rfidHost.id) {
  throw new Error("RFID should snap onto the nearest track piece");
}
if (Math.abs((rfidGhost.alongMm ?? 0) - 150) > 8) {
  throw new Error(`RFID alongMm should be near 150, got ${rfidGhost.alongMm}`);
}
const rfid = createPlacedPiece({ type: "rfid" }, rfidGhost.x, rfidGhost.y, rfidGhost.rotationDeg);
const placedRfid = {
  ...rfid,
  hostPieceId: rfidGhost.hostPieceId,
  alongMm: rfidGhost.alongMm,
  hostPath: rfidGhost.hostPath,
  fadeMs: 4000,
  showName: true,
  mqtt: { topic: "", payloadThrough: "", payloadDiverge: "", statusTopic: "garden/rfid/1" },
};
const withRfid = parseLayout({
  version: 1,
  settings: {},
  pieces: [rfidHost, placedRfid],
});
const savedRfid = parseLayout(JSON.parse(serializeLayout(withRfid))).pieces.find((piece) => piece.type === "rfid");
if (
  savedRfid?.hostPieceId !== rfidHost.id ||
  savedRfid.mqtt?.statusTopic !== "garden/rfid/1" ||
  savedRfid.fadeMs !== 4000 ||
  savedRfid.showName !== true
) {
  throw new Error("RFID persist roundtrip failed");
}
if (rfidNameSide(placedRfid, [rfidHost, placedRfid]) !== "above") {
  throw new Error("RFID name on east-west track should default above");
}
if (rfidNameSide({ ...placedRfid, nameOpposite: true }, [rfidHost, placedRfid]) !== "below") {
  throw new Error("RFID name toggle on east-west track should move below");
}
const uprightHost = createPlacedPiece({ type: "straight", lengthMm: 300 }, 0, 0, 90);
const uprightRfid = {
  ...createPlacedPiece({ type: "rfid" }, 0, 150, 90),
  hostPieceId: uprightHost.id,
  alongMm: 150,
  hostPath: 0,
};
if (rfidNameSide(uprightRfid, [uprightHost, uprightRfid]) !== "right") {
  throw new Error("RFID name on north-south track should default to the right");
}
if (rfidNameSide({ ...uprightRfid, nameOpposite: true }, [uprightHost, uprightRfid]) !== "left") {
  throw new Error("RFID name toggle on north-south track should move left");
}
const flippedRfid = parseLayout({
  version: 1,
  settings: {},
  pieces: [{ ...placedRfid, nameOpposite: true }],
}).pieces[0];
if (flippedRfid?.nameOpposite !== true) {
  throw new Error("RFID name side should persist");
}
const copied = clonePieces([rfidHost, placedRfid]);
const copiedHost = copied.find((piece) => piece.type === "straight");
const copiedRfid = copied.find((piece) => piece.type === "rfid");
if (!copiedHost || !copiedRfid || copiedRfid.hostPieceId !== copiedHost.id) {
  throw new Error("paste should remap RFID hostPieceId when the host is copied");
}
const orphan = clonePieces([placedRfid])[0];
if (orphan.hostPieceId) {
  throw new Error("pasting an RFID without its host should drop the old host id");
}

const roster = parseRoster({
  locos: [{ id: "loco-1", address: 3, name: "Stainz", tag: "E200" }, { address: 0, name: "Bad" }],
});
if (roster.length !== 2 || roster[0].address !== 3 || roster[1].address !== null) {
  throw new Error("roster parse should keep names and clamp invalid addresses");
}

console.log("geometry and persist checks passed");
