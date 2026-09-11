import {
  RAIL_OFFSET,
  TIE_LENGTH_MM,
  TIE_SPACING_MM,
  TIE_WIDTH_MM,
  curveSpec,
  localArcPoint,
  pointSpec,
  signalSpec,
} from "../catalog/lgb";
import { degToRad, localToWorld } from "../model/geometry";
import type { Hand, LayoutPiece, Vec2, ViewState, WorldPort } from "../model/types";

export interface DrawExtras {
  selectedId: string | null;
  ghost?: LayoutPiece;
  freePorts: WorldPort[];
  anim: Map<string, number>;
  hoverLeverId?: string | null;
}

function sampleArc(radiusMm: number, angleDeg: number, hand: Hand, stepMm = 14): Vec2[] {
  const theta = degToRad(angleDeg);
  const length = radiusMm * theta;
  const steps = Math.max(8, Math.ceil(length / stepMm));
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i += 1) {
    pts.push(localArcPoint(radiusMm, (theta * i) / steps, hand));
  }
  return pts;
}

function sampleStraight(lengthMm: number, stepMm = 20): Vec2[] {
  const steps = Math.max(1, Math.ceil(lengthMm / stepMm));
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i += 1) {
    pts.push({ x: (lengthMm * i) / steps, y: 0 });
  }
  return pts;
}

export function piecePaths(piece: LayoutPiece): Vec2[][] {
  if (piece.type === "signal") return [];
  if (piece.type === "straight") {
    return [sampleStraight(Math.max(1, piece.lengthMm ?? 300))];
  }
  if (piece.type === "curve") {
    const spec = curveSpec(piece.sku);
    if (!spec) return [];
    return [sampleArc(spec.radiusMm, spec.angleDeg, piece.hand ?? "left")];
  }
  const spec = pointSpec(piece.sku);
  if (!spec) return [];
  const hand = piece.hand ?? spec.hand;
  return [
    sampleStraight(spec.throughMm),
    sampleArc(spec.radiusMm, spec.angleDeg, hand),
  ];
}

function samplePath(path: Vec2[], i: number, n: number): Vec2 {
  if (path.length === 1) return path[0];
  const idx = (i / Math.max(1, n - 1)) * (path.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(path.length - 1, lo + 1);
  const f = idx - lo;
  return {
    x: path[lo].x + (path[hi].x - path[lo].x) * f,
    y: path[lo].y + (path[hi].y - path[lo].y) * f,
  };
}

function mixPaths(a: Vec2[], b: Vec2[], t: number): Vec2[] {
  const n = Math.max(a.length, b.length, 2);
  const out: Vec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = samplePath(a, i, n);
    const q = samplePath(b, i, n);
    out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  }
  return out;
}

export function worldPath(piece: LayoutPiece, local: Vec2[]): Vec2[] {
  return local.map((p) => localToWorld(piece, p));
}

function offsetLine(pts: Vec2[], dist: number): Vec2[] {
  return pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    return { x: p.x + (-ty / len) * dist, y: p.y + (tx / len) * dist };
  });
}

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  width: number,
  color: string,
  alpha = 1,
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

function fillTies(ctx: CanvasRenderingContext2D, pts: Vec2[], alpha = 1): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#6b4423";
  let traveled = 0;
  let nextAt = TIE_SPACING_MM / 2;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (traveled + seg >= nextAt) {
      const t = (nextAt - traveled) / seg;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillRect(-TIE_WIDTH_MM / 2, -TIE_LENGTH_MM / 2, TIE_WIDTH_MM, TIE_LENGTH_MM);
      ctx.restore();
      nextAt += TIE_SPACING_MM;
    }
    traveled += seg;
  }
  ctx.restore();
}

export function leverLocal(piece: LayoutPiece): Vec2 | undefined {
  const spec = pointSpec(piece.sku);
  if (!spec) return undefined;
  const hand = piece.hand ?? spec.hand;
  const side = hand === "left" ? 1 : -1;
  return { x: 48, y: side * (RAIL_OFFSET + 36) };
}

export function leverWorld(piece: LayoutPiece): Vec2 | undefined {
  const local = leverLocal(piece);
  if (!local) return undefined;
  return localToWorld(piece, local);
}

export function signalHeadLocal(): Vec2 {
  return { x: 0, y: -58 };
}

export function signalHeadWorld(piece: LayoutPiece): Vec2 {
  return localToWorld(piece, signalHeadLocal());
}

function drawSignal(
  ctx: CanvasRenderingContext2D,
  piece: LayoutPiece,
  anim: number,
  hover: boolean,
  alpha: number,
): void {
  const spec = signalSpec(piece.sku);
  const origin = localToWorld(piece, { x: 0, y: 0 });
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.rotate(degToRad(piece.rotationDeg));
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = hover ? "#e8c36a" : "#3a2a12";
  ctx.lineWidth = 2.2;
    ctx.fillStyle = "#4a4a4a";
    ctx.fillRect(-4, -50, 8, 50);
    ctx.fillStyle = "#2c2c2c";
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (spec?.kind === "colour-light") {
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.roundRect(-11, -78, 22, 40, 4);
    ctx.fill();
    ctx.stroke();
    const clear = anim;
    ctx.fillStyle = `rgba(40, 180, 70, ${0.2 + 0.8 * clear})`;
    ctx.beginPath();
    ctx.arc(0, -66, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(210, 40, 40, ${0.2 + 0.8 * (1 - clear)})`;
    ctx.beginPath();
    ctx.arc(0, -50, 7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const armAngle = degToRad(-55 * anim);
    ctx.save();
    ctx.translate(0, -56);
    ctx.rotate(armAngle);
    ctx.fillStyle = hover ? "#f0d48a" : "#c43c2c";
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(4, -5, 46, 10);
    ctx.fillStyle = "#efe6d2";
    ctx.fillRect(38, -5, 12, 10);
    ctx.fillStyle = anim > 0.5 ? "#3cb85a" : "#d94a3a";
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (hover) {
    ctx.strokeStyle = "#e8c36a";
    ctx.beginPath();
    ctx.arc(0, -58, 22, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLever(
  ctx: CanvasRenderingContext2D,
  piece: LayoutPiece,
  anim: number,
  hover: boolean,
): void {
  const local = leverLocal(piece);
  if (!local) return;
  const world = localToWorld(piece, local);
  const throwAngle = (piece.hand === "left" ? -1 : 1) * (28 - 56 * anim);
  ctx.save();
  ctx.translate(world.x, world.y);
  ctx.rotate(degToRad(piece.rotationDeg + throwAngle));
  ctx.fillStyle = hover ? "#e8c36a" : "#c4a35a";
  ctx.strokeStyle = "#3a2a12";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-7, -7, 14, 14, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#8b1e1e";
  ctx.beginPath();
  ctx.roundRect(-4, -40, 8, 36, 3);
  ctx.fill();
  ctx.fillStyle = "#d4b06a";
  ctx.beginPath();
  ctx.arc(0, -44, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPointExtras(
  ctx: CanvasRenderingContext2D,
  piece: LayoutPiece,
  through: Vec2[],
  diverge: Vec2[],
  anim: number,
  alpha: number,
): void {
  const spec = pointSpec(piece.sku);
  if (!spec) return;
  const bladeLen = Math.min(110, spec.throughMm * 0.38);
  const take = (path: Vec2[], len: number) => {
    const out: Vec2[] = [path[0]];
    let acc = 0;
    for (let i = 1; i < path.length; i += 1) {
      const step = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      if (acc + step >= len) {
        const t = (len - acc) / step;
        out.push({
          x: path[i - 1].x + (path[i].x - path[i - 1].x) * t,
          y: path[i - 1].y + (path[i].y - path[i - 1].y) * t,
        });
        break;
      }
      out.push(path[i]);
      acc += step;
    }
    return out;
  };

  const throughBlade = take(through, bladeLen);
  const divergeBlade = take(diverge, bladeLen);
  const mix = (a: Vec2[], b: Vec2[], t: number) =>
    a.map((p, i) => {
      const q = b[Math.min(i, b.length - 1)];
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    });

  const closed = mix(throughBlade, divergeBlade, anim);
  const open = mix(divergeBlade, throughBlade, anim);

  strokePolyline(ctx, offsetLine(closed, RAIL_OFFSET), 3.4, "#f0d48a", alpha);
  strokePolyline(ctx, offsetLine(open, -RAIL_OFFSET), 2.4, "#b08a40", alpha * 0.7);

  const route = mixPaths(through, diverge, anim);
  strokePolyline(ctx, route, 4.2, "#7dffb0", alpha);

  const frogIndex = Math.min(through.length - 1, Math.round(through.length * 0.42));
  const frog = through[frogIndex];
  if (frog) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#c9a227";
    ctx.beginPath();
    ctx.arc(frog.x, frog.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: LayoutPiece,
  extras: DrawExtras,
  ghost = false,
): void {
  const alpha = ghost ? 0.45 : 1;
  const selected = extras.selectedId === piece.id;
  const paths = piecePaths(piece).map((path) => worldPath(piece, path));
  const seen = new Set<string>();

  for (const path of paths) {
    const key = path.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    fillTies(ctx, path, alpha);
  }

  const pointAnim =
    piece.type === "point"
      ? extras.anim.get(piece.id) ?? (piece.pointState === "diverge" ? 1 : 0)
      : 0;

  paths.forEach((path, index) => {
    const routeAlpha =
      piece.type === "point" && paths.length > 1
        ? index === 0
          ? alpha * (1 - 0.4 * pointAnim)
          : alpha * (0.6 + 0.4 * pointAnim)
        : alpha;
    strokePolyline(ctx, offsetLine(path, RAIL_OFFSET), 3.6, "#d4b06a", routeAlpha);
    strokePolyline(ctx, offsetLine(path, -RAIL_OFFSET), 3.6, "#d4b06a", routeAlpha);
    if (selected) strokePolyline(ctx, path, 7, "#7dffb0", 0.28);
  });

  if (piece.type === "point" && paths[0] && paths[1]) {
    drawPointExtras(ctx, piece, paths[0], paths[1], pointAnim, alpha);
    if (!ghost) drawLever(ctx, piece, pointAnim, extras.hoverLeverId === piece.id);
  }

  if (piece.type === "signal") {
    const anim = extras.anim.get(piece.id) ?? (piece.signalState === "clear" ? 1 : 0);
    drawSignal(ctx, piece, anim, extras.hoverLeverId === piece.id, alpha);
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, view: ViewState, width: number, height: number): void {
  const topLeft = screenToWorld(view, 0, 0);
  const bottomRight = screenToWorld(view, width, height);
  ctx.save();
  for (const [step, color, line] of [
    [100, "rgba(255,255,255,0.08)", 1],
    [300, "rgba(212,176,106,0.18)", 1.2],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = line / view.zoom;
    ctx.beginPath();
    const x0 = Math.floor(topLeft.x / step) * step;
    const y0 = Math.floor(topLeft.y / step) * step;
    for (let x = x0; x <= bottomRight.x; x += step) {
      ctx.moveTo(x, topLeft.y);
      ctx.lineTo(x, bottomRight.y);
    }
    for (let y = y0; y <= bottomRight.y; y += step) {
      ctx.moveTo(topLeft.x, y);
      ctx.lineTo(bottomRight.x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function screenToWorld(view: ViewState, sx: number, sy: number): Vec2 {
  return { x: sx / view.zoom + view.panX, y: sy / view.zoom + view.panY };
}

export function applyView(ctx: CanvasRenderingContext2D, view: ViewState, dpr = 1): void {
  ctx.setTransform(
    view.zoom * dpr,
    0,
    0,
    view.zoom * dpr,
    -view.panX * view.zoom * dpr,
    -view.panY * view.zoom * dpr,
  );
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  pieces: LayoutPiece[],
  view: ViewState,
  width: number,
  height: number,
  extras: DrawExtras,
  dpr = 1,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#2c3328";
  ctx.fillRect(0, 0, width, height);
  applyView(ctx, view, dpr);
  drawGrid(ctx, view, width, height);

  const track = pieces.filter((piece) => piece.type !== "signal");
  const signals = pieces.filter((piece) => piece.type === "signal");
  for (const piece of track) drawPiece(ctx, piece, extras);
  for (const piece of signals) drawPiece(ctx, piece, extras);
  if (extras.ghost) drawPiece(ctx, extras.ghost, extras, true);

  ctx.save();
  for (const port of extras.freePorts) {
    ctx.fillStyle = "#8fd4a8";
    ctx.beginPath();
    ctx.arc(port.x, port.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#17351f";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(12, height - 36, 118, 22);
  ctx.fillStyle = "#e7d7a7";
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.fillText("300 mm", 20, height - 20);
  ctx.strokeStyle = "#d4b06a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, height - 25);
  ctx.lineTo(70 + 300 * view.zoom, height - 25);
  ctx.stroke();
}

export function hitTestPiece(piece: LayoutPiece, world: Vec2, threshold = 28): boolean {
  if (piece.type === "signal") return hitTestSignal(piece, world);
  for (const local of piecePaths(piece)) {
    const path = worldPath(piece, local);
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1];
      const b = path[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((world.x - a.x) * dx + (world.y - a.y) * dy) / len2));
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      if (Math.hypot(world.x - px, world.y - py) <= threshold) return true;
    }
  }
  return false;
}

export function hitTestLever(piece: LayoutPiece, world: Vec2, radius = 28): boolean {
  const lever = leverWorld(piece);
  if (!lever) return false;
  return Math.hypot(world.x - lever.x, world.y - lever.y) <= radius;
}

export function hitTestSignal(piece: LayoutPiece, world: Vec2, radius = 32): boolean {
  const head = signalHeadWorld(piece);
  const base = localToWorld(piece, { x: 0, y: 0 });
  return (
    Math.hypot(world.x - head.x, world.y - head.y) <= radius ||
    Math.hypot(world.x - base.x, world.y - base.y) <= 18
  );
}
