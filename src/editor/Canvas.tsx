import { useEffect, useRef, useState } from "react";
import { placeDebug, placeDebugOn, usePlaceDebugLog } from "../debug";
import { clamp, lerp, localToWorld, worldToLocal } from "../model/geometry";
import { mqttService } from "../mqtt/client";
import { createPlacedPiece, flipPiece, flipPlacing, placingFromPiece } from "./pieceFactory";
import { liveSections } from "./liveRoutes";
import {
  boundsContain,
  boundsIntersect,
  drawScene,
  hitTestLever,
  hitTestPiece,
  hitTestSignal,
  pieceBounds,
  screenToWorld,
  type Bounds,
} from "./render";
import { piecesAt } from "./selection";
import { attachPortId, cyclePlacingSnap, freePorts, ghostAt, snapMovedPiece } from "./snap";
import { useEditor } from "./store";
import type { LayoutPiece } from "../model/types";

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 3.2;
const MARQUEE_PX = 8;

function safeLiveSections(pieces: LayoutPiece[]) {
  try {
    return liveSections(pieces);
  } catch {
    return undefined;
  }
}

type Drag =
  | { mode: "pan"; lastX: number; lastY: number }
  | {
      mode: "move";
      id: string;
      grabX: number;
      grabY: number;
      orig: { id: string; x: number; y: number; rotationDeg: number }[];
    }
  | {
      mode: "marquee";
      startClientX: number;
      startClientY: number;
      currentClientX: number;
      currentClientY: number;
      startWorld: { x: number; y: number };
      currentWorld: { x: number; y: number };
      additive: boolean;
    };

export function EditorCanvas() {
  const {
    layout,
    selectedIds,
    placing,
    pasting,
    view,
    editorMode,
    dispatch,
    addPiece,
    replacePiece,
    replacePieces,
    previewPieces,
    togglePoint,
    toggleSignal,
  } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(new Map<string, number>());
  const dragRef = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<ReturnType<typeof ghostAt> | undefined>();
  const [hoverLeverId, setHoverLeverId] = useState<string | null>(null);
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0 });
  const cursorRef = useRef(cursorWorld);
  cursorRef.current = cursorWorld;
  const debugLog = usePlaceDebugLog();
  const debug = placeDebugOn();
  const plan = editorMode === "plan";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const loop = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      for (const piece of layout.pieces) {
        let target: number | undefined;
        if (piece.type === "point") target = piece.pointState === "diverge" ? 1 : 0;
        if (piece.type === "signal") target = piece.signalState === "clear" ? 1 : 0;
        if (target === undefined) continue;
        const current = animRef.current.get(piece.id) ?? target;
        const next = lerp(current, target, 0.18);
        animRef.current.set(piece.id, Math.abs(next - target) < 0.005 ? target : next);
      }

      const drag = dragRef.current;
      drawScene(
        ctx,
        layout.pieces,
        view,
        width,
        height,
        {
          selectedIds,
          ghost: plan && placing ? ghost : undefined,
          ghosts: plan && pasting ? piecesAt(pasting, cursorRef.current) : undefined,
          freePorts: plan ? freePorts(layout.pieces) : [],
          anim: animRef.current,
          hoverLeverId,
          editorMode,
          zoom: view.zoom,
          liveSections: plan ? undefined : safeLiveSections(layout.pieces),
          attachPortId: plan && placing ? attachPortId(placing) : undefined,
          marquee:
            drag?.mode === "marquee"
              ? {
                  x0: drag.startWorld.x,
                  y0: drag.startWorld.y,
                  x1: drag.currentWorld.x,
                  y1: drag.currentWorld.y,
                  crossing: drag.currentClientX < drag.startClientX,
                }
              : undefined,
        },
        dpr,
      );
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [editorMode, ghost, hoverLeverId, layout.pieces, pasting, placing, plan, selectedIds, view]);

  useEffect(() => {
    if (!plan || !placing) {
      setGhost(undefined);
      return;
    }
    setGhost(ghostAt(placing, layout.pieces, cursorWorld.x, cursorWorld.y));
  }, [cursorWorld.x, cursorWorld.y, layout.pieces, placing, plan]);

  useEffect(() => {
    if (!plan || !placing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        dispatch({ type: "setPlacing", placing: flipPlacing(placing) });
        return;
      }
      if (placing.type === "signal") return;
      if (key === "d" || key === "s") {
        event.preventDefault();
        dispatch({
          type: "setPlacing",
          placing: cyclePlacingSnap(placing, key === "d" ? 1 : -1),
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, placing, plan]);

  const eventWorld = (event: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return screenToWorld(view, event.clientX - rect.left, event.clientY - rect.top);
  };

  const pieceAt = (world: { x: number; y: number }) => {
    for (let i = layout.pieces.length - 1; i >= 0; i -= 1) {
      const piece = layout.pieces[i];
      if (hitTestPiece(piece, world, 28, view.zoom)) return piece;
    }
    return undefined;
  };

  const leverAt = (world: { x: number; y: number }) => {
    for (let i = layout.pieces.length - 1; i >= 0; i -= 1) {
      const piece = layout.pieces[i];
      if (
        piece.type === "point" &&
        hitTestLever(piece, world, view.zoom, {
          alongLever: !plan,
          anim: piece.pointState === "diverge" ? 1 : 0,
        })
      ) {
        return piece;
      }
      if (piece.type === "signal" && hitTestSignal(piece, world, view.zoom)) return piece;
    }
    return undefined;
  };

  const throwPoint = (id: string) => {
    const next = togglePoint(id);
    const piece = layout.pieces.find((item) => item.id === id);
    if (!piece?.mqtt?.topic || !next) return;
    const payload = next === "diverge" ? piece.mqtt.payloadDiverge : piece.mqtt.payloadThrough;
    mqttService.publish(piece.mqtt.topic, payload);
  };

  const throwSignal = (id: string) => {
    const next = toggleSignal(id);
    const piece = layout.pieces.find((item) => item.id === id);
    if (!piece?.mqtt?.topic || !next) return;
    const payload = next === "clear" ? piece.mqtt.payloadClear ?? "clear" : piece.mqtt.payloadDanger ?? "danger";
    mqttService.publish(piece.mqtt.topic, payload);
  };

  const lastPlaceMs = useRef(0);

  const cancelPlacing = () => {
    dispatch({ type: "setPlacing", placing: null });
    dispatch({ type: "setPasting", pieces: null });
    setGhost(undefined);
  };

  const commitPaste = (world: { x: number; y: number }) => {
    if (!plan || !pasting?.length) return;
    const now = performance.now();
    if (now - lastPlaceMs.current < 150) return;
    lastPlaceMs.current = now;
    dispatch({ type: "addPieces", pieces: piecesAt(pasting, world) });
  };

  const commitPlace = (world: { x: number; y: number }, source: string) => {
    if (!plan || !placing) {
      placeDebug(`${source} commitPlace skipped (not placing)`);
      return;
    }
    const now = performance.now();
    if (now - lastPlaceMs.current < 150) {
      placeDebug(`${source} commitPlace skipped (debounce)`);
      return;
    }
    lastPlaceMs.current = now;
    placeDebug(`${source} commitPlace`);
    try {
      const preview = ghostAt(placing, layout.pieces, world.x, world.y);
      const piece = createPlacedPiece(placingFromPiece(preview), preview.x, preview.y, preview.rotationDeg);
      addPiece(piece);
      placeDebug(`addPiece ${piece.type} ${piece.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      placeDebug(`ERROR ${message}`);
      console.error("Failed to place track piece", error);
    }
  };

  const isPrimaryButton = (event: { button: number; pointerType?: string }) =>
    event.button === 0 || event.pointerType === "touch" || event.pointerType === "pen";

  const capture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers throw here on HTTP / canvas; drag still works via move/up.
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const world = eventWorld(event);
    placeDebug(
      `pointerdown button=${event.button} type=${event.pointerType} placing=${Boolean(placing)} pasting=${Boolean(pasting)} mode=${editorMode}`,
    );

    if (plan && pasting) {
      event.preventDefault();
      if (event.button === 2) {
        cancelPlacing();
        return;
      }
      if (isPrimaryButton(event)) commitPaste(world);
      return;
    }

    if (plan && placing) {
      event.preventDefault();
      if (event.button === 2) {
        cancelPlacing();
        placeDebug("pointerdown cancel placing");
        return;
      }
      if (isPrimaryButton(event)) commitPlace(world, "pointerdown");
      else placeDebug(`pointerdown skip place button=${event.button}`);
      return;
    }

    capture(event);

    if (event.button === 2 || event.button === 1) {
      dragRef.current = { mode: "pan", lastX: event.clientX, lastY: event.clientY };
      return;
    }

    const lever = leverAt(world);
    if (lever && event.button === 0) {
      dispatch({ type: "select", id: lever.id, additive: event.shiftKey && plan });
      if (lever.type === "signal") throwSignal(lever.id);
      else throwPoint(lever.id);
      return;
    }

    const hit = pieceAt(world);
    if (hit && event.button === 0) {
      const additive = event.shiftKey && plan;
      if (additive) {
        dispatch({ type: "select", id: hit.id, additive: true });
        if (selectedIds.includes(hit.id)) return;
      } else if (!selectedIds.includes(hit.id)) {
        dispatch({ type: "select", id: hit.id });
      }
      if (plan) {
        const group = additive || selectedIds.includes(hit.id) ? [...new Set([...selectedIds, hit.id])] : [hit.id];
        dragRef.current = {
          mode: "move",
          id: hit.id,
          grabX: world.x,
          grabY: world.y,
          orig: layout.pieces
            .filter((piece) => group.includes(piece.id))
            .map((piece) => ({ id: piece.id, x: piece.x, y: piece.y, rotationDeg: piece.rotationDeg })),
        };
      }
      return;
    }

    if (event.button !== 0) return;
    if (plan) {
      dragRef.current = {
        mode: "marquee",
        startClientX: event.clientX,
        startClientY: event.clientY,
        currentClientX: event.clientX,
        currentClientY: event.clientY,
        startWorld: world,
        currentWorld: world,
        additive: event.shiftKey,
      };
      if (!event.shiftKey) dispatch({ type: "select", id: null });
      return;
    }
    dispatch({ type: "select", id: null });
    dragRef.current = { mode: "pan", lastX: event.clientX, lastY: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const world = eventWorld(event);
    setCursorWorld(world);
    setHoverLeverId(placing ? null : (leverAt(world)?.id ?? null));

    if (plan && placing) {
      setGhost(ghostAt(placing, layout.pieces, world.x, world.y));
    }

    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === "pan") {
      const dx = (event.clientX - drag.lastX) / view.zoom;
      const dy = (event.clientY - drag.lastY) / view.zoom;
      dispatch({
        type: "setView",
        view: { panX: view.panX - dx, panY: view.panY - dy },
      });
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      return;
    }
    if (drag.mode === "marquee") {
      drag.currentWorld = world;
      drag.currentClientX = event.clientX;
      drag.currentClientY = event.clientY;
      return;
    }

    const dx = world.x - drag.grabX;
    const dy = world.y - drag.grabY;
    const next: LayoutPiece[] = [];
    for (const orig of drag.orig) {
      const piece = layout.pieces.find((item) => item.id === orig.id);
      if (!piece) continue;
      next.push({ ...piece, x: orig.x + dx, y: orig.y + dy });
    }
    if (next.length) previewPieces(next);
  };

  const finishMarquee = (drag: Extract<Drag, { mode: "marquee" }>) => {
    const dist = Math.hypot(
      drag.currentClientX - drag.startClientX,
      drag.currentClientY - drag.startClientY,
    );
    if (dist < MARQUEE_PX) {
      if (!drag.additive) dispatch({ type: "select", id: null });
      return;
    }
    const box: Bounds = {
      minX: Math.min(drag.startWorld.x, drag.currentWorld.x),
      minY: Math.min(drag.startWorld.y, drag.currentWorld.y),
      maxX: Math.max(drag.startWorld.x, drag.currentWorld.x),
      maxY: Math.max(drag.startWorld.y, drag.currentWorld.y),
    };
    const crossing = drag.currentClientX < drag.startClientX;
    const hit = layout.pieces
      .filter((piece) => {
        const bounds = pieceBounds(piece, view.zoom);
        return crossing ? boundsIntersect(box, bounds) : boundsContain(box, bounds);
      })
      .map((piece) => piece.id);
    const ids = drag.additive ? [...new Set([...selectedIds, ...hit])] : hit;
    dispatch({ type: "setSelection", ids });
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.mode === "marquee") {
      finishMarquee(drag);
      return;
    }
    if (drag.mode !== "move") return;
    const grab = layout.pieces.find((item) => item.id === drag.id);
    const origGrab = drag.orig.find((item) => item.id === drag.id);
    if (!grab || !origGrab) return;
    const selected = new Set(drag.orig.map((item) => item.id));
    const snapped = snapMovedPiece(
      grab,
      layout.pieces.filter((item) => !selected.has(item.id)),
    );
    const dRot = snapped.rotationDeg - origGrab.rotationDeg;
    const moved =
      Math.hypot(snapped.x - origGrab.x, snapped.y - origGrab.y) > 0.4 || Math.abs(dRot) > 0.2;
    if (!moved) {
      const restored: LayoutPiece[] = [];
      for (const orig of drag.orig) {
        const piece = layout.pieces.find((item) => item.id === orig.id);
        if (piece) restored.push({ ...piece, x: orig.x, y: orig.y, rotationDeg: orig.rotationDeg });
      }
      if (restored.length) previewPieces(restored);
      return;
    }
    const next: LayoutPiece[] = [];
    for (const orig of drag.orig) {
      const piece = layout.pieces.find((item) => item.id === orig.id);
      if (!piece) continue;
      if (orig.id === grab.id) {
        next.push({ ...piece, ...snapped, id: piece.id, type: piece.type });
        continue;
      }
      const local = worldToLocal(
        { x: origGrab.x, y: origGrab.y, rotationDeg: origGrab.rotationDeg },
        { x: orig.x, y: orig.y },
      );
      const world = localToWorld(snapped, local);
      next.push({
        ...piece,
        x: world.x,
        y: world.y,
        rotationDeg: orig.rotationDeg + dRot,
      });
    }
    replacePieces(next);
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const before = screenToWorld(view, sx, sy);
    const zoom = clamp(view.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), MIN_ZOOM, MAX_ZOOM);
    const panX = before.x - sx / zoom;
    const panY = before.y - sy / zoom;
    dispatch({ type: "setView", view: { zoom, panX, panY } });
  };

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        className={plan && (placing || pasting) ? "placing" : hoverLeverId ? "lever" : ""}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
        onWheel={onWheel}
        onDoubleClick={() => {
          placeDebug(`dblclick placing=${Boolean(placing)} selected=${selectedIds.join(",") || "none"}`);
          if (!plan) return;
          if (selectedIds.length) {
            const flipped = layout.pieces.filter((item) => selectedIds.includes(item.id)).map(flipPiece);
            if (flipped.length === 1) replacePiece(flipped[0]);
            else replacePieces(flipped);
          } else if (placing) {
            dispatch({ type: "setPlacing", placing: flipPlacing(placing) });
          }
        }}
      />
      {plan && pasting && (
        <div className="canvas-hint">
          Click to drop the copy · R rotate 90° · Esc or right-click cancel
        </div>
      )}
      {plan && placing && !pasting && (
        <div className="canvas-hint">
          Click to place · Esc cancel · F flip / rotate · S / D cycle this piece's joiner · Right-click cancel
        </div>
      )}
      {plan && !placing && !pasting && (
        <div className="canvas-hint">
          Drag empty canvas to box-select · Shift+click add · Ctrl+C/V copy · R rotate · Right-drag pan
        </div>
      )}
      {!plan && (
        <div className="canvas-hint">Click levers and signals to throw · Drag empty canvas to pan</div>
      )}
      {debug && (
        <pre className="place-debug">
          {debugLog.length ? debugLog.join("\n") : "debug=1 · click the canvas"}
        </pre>
      )}
    </div>
  );
}
