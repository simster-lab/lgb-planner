import { applyView, screenToWorld } from "../src/editor/render.ts";
import type { ViewState } from "../src/model/types.ts";

const view: ViewState = { panX: -400, panY: -250, zoom: 0.55 };
const dpr = 1.4;
const sx = 695;
const sy = 511;
const world = screenToWorld(view, sx, sy);

const canvas = {
  setTransform(a: number, _b: number, _c: number, d: number, e: number, f: number) {
    this.a = a;
    this.d = d;
    this.e = e;
    this.f = f;
  },
  a: 1,
  d: 1,
  e: 0,
  f: 0,
};

applyView(canvas as unknown as CanvasRenderingContext2D, view, dpr);
const bitmapX = world.x * canvas.a + canvas.e;
const bitmapY = world.y * canvas.d + canvas.f;
const expectedX = sx * dpr;
const expectedY = sy * dpr;

if (Math.abs(bitmapX - expectedX) > 0.01 || Math.abs(bitmapY - expectedY) > 0.01) {
  throw new Error(
    `pointer/draw mismatch: bitmap (${bitmapX},${bitmapY}) vs expected (${expectedX},${expectedY})`,
  );
}
console.log("pointer and draw stay aligned at dpr", dpr);
