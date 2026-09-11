import { useEffect, useRef, useState } from "react";
import { placeDebug, placeDebugOn, usePlaceDebugLog } from "../debug";
import { clamp, lerp } from "../model/geometry";
import { mqttService } from "../mqtt/client";
import { createPlacedPiece, flipPiece, placingFromPiece } from "./pieceFactory";
import { drawScene, hitTestLever, hitTestPiece, screenToWorld, signalHeadWorld } from "./render";
import { freePorts, ghostAt, snapMovedPiece } from "./snap";
import { useEditor } from "./store";

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 3.2;

export function EditorCanvas() {
  const {
    layout,
    selectedId,
    placing,
    view,
    dispatch,
    addPiece,
    replacePiece,
    previewPiece,
    togglePoint,
    toggleSignal,
  } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(new Map<string, number>());
  const dragRef = useRef<
    | { mode: "pan"; lastX: number; lastY: number }
    | { mode: "move"; id: string; grabX: number; grabY: number; origX: number; origY: number }
    | null
  >(null);
  const [ghost, setGhost] = useState<ReturnType<typeof ghostAt> | undefined>();
  const [hoverLeverId, setHoverLeverId] = useState<string | null>(null);
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0 });
  const debugLog = usePlaceDebugLog();
  const debug = placeDebugOn();

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

      drawScene(
        ctx,
        layout.pieces,
        view,
        width,
        height,
        {
          selectedId,
          ghost: placing ? ghost : undefined,
          freePorts: freePorts(layout.pieces),
          anim: animRef.current,
          hoverLeverId,
        },
        dpr,
      );
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [ghost, hoverLeverId, layout.pieces, placing, selectedId, view]);

  const eventWorld = (event: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return screenToWorld(view, event.clientX - rect.left, event.clientY - rect.top);
  };

  const pieceAt = (world: { x: number; y: number }) => {
    for (let i = layout.pieces.length - 1; i >= 0; i -= 1) {
      const piece = layout.pieces[i];
      if (hitTestPiece(piece, world)) return piece;
    }
    return undefined;
  };

  const leverAt = (world: { x: number; y: number }) => {
    for (let i = layout.pieces.length - 1; i >= 0; i -= 1) {
      const piece = layout.pieces[i];
      if (piece.type === "point" && hitTestLever(piece, world)) return piece;
      if (piece.type === "signal") {
        const head = signalHeadWorld(piece);
        if (Math.hypot(world.x - head.x, world.y - head.y) <= 32) return piece;
      }
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
    setGhost(undefined);
  };

  const commitPlace = (world: { x: number; y: number }, source: string) => {
    if (!placing) {
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

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const world = eventWorld(event);
    placeDebug(
      `pointerdown button=${event.button} type=${event.pointerType} placing=${Boolean(placing)}`,
    );

    if (placing) {
      if (event.button === 2) {
        cancelPlacing();
        placeDebug("pointerdown cancel placing");
        return;
      }
      if (isPrimaryButton(event)) commitPlace(world, "pointerdown");
      else placeDebug(`pointerdown skip place button=${event.button}`);
      return;
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers throw here on HTTP / canvas; drag still works via move/up.
    }

    const lever = leverAt(world);
    if (lever && event.button === 0) {
      dispatch({ type: "select", id: lever.id });
      if (lever.type === "signal") throwSignal(lever.id);
      else throwPoint(lever.id);
      return;
    }

    const hit = pieceAt(world);
    if (hit && event.button === 0) {
      dispatch({ type: "select", id: hit.id });
      dragRef.current = {
        mode: "move",
        id: hit.id,
        grabX: world.x,
        grabY: world.y,
        origX: hit.x,
        origY: hit.y,
      };
      return;
    }

    dispatch({ type: "select", id: null });
    dragRef.current = { mode: "pan", lastX: event.clientX, lastY: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const world = eventWorld(event);
    setCursorWorld(world);
    setHoverLeverId(placing ? null : (leverAt(world)?.id ?? null));

    if (placing) {
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

    const piece = layout.pieces.find((item) => item.id === drag.id);
    if (!piece) return;
    previewPiece({
      ...piece,
      x: drag.origX + (world.x - drag.grabX),
      y: drag.origY + (world.y - drag.grabY),
    });
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.mode !== "move") return;
    const piece = layout.pieces.find((item) => item.id === drag.id);
    if (!piece) return;
    const snapped = snapMovedPiece(
      piece,
      layout.pieces.filter((item) => item.id !== piece.id),
    );
    const moved =
      snapped.x !== drag.origX ||
      snapped.y !== drag.origY ||
      snapped.rotationDeg !== piece.rotationDeg;
    if (moved) replacePiece(snapped);
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
        className={placing ? "placing" : hoverLeverId ? "lever" : ""}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(event) => {
          placeDebug(`click placing=${Boolean(placing)}`);
          if (!placing) return;
          commitPlace(eventWorld(event), "click");
        }}
        onContextMenu={(event) => event.preventDefault()}
        onWheel={onWheel}
        onDoubleClick={() => {
          placeDebug(`dblclick placing=${Boolean(placing)} selected=${selectedId ?? "none"}`);
          if (selectedId) {
            const piece = layout.pieces.find((item) => item.id === selectedId);
            if (piece) replacePiece(flipPiece(piece));
          } else if (placing) {
            dispatch({
              type: "setPlacing",
              placing: { ...placing, hand: placing.hand === "right" ? "left" : "right" },
            });
            setGhost(ghostAt(
              { ...placing, hand: placing.hand === "right" ? "left" : "right" },
              layout.pieces,
              cursorWorld.x,
              cursorWorld.y,
            ));
          }
        }}
      />
      {placing && (
        <div className="canvas-hint">
          Click to place · Esc cancel · F or double-click to flip · Right-click cancel
        </div>
      )}
      {debug && (
        <pre className="place-debug">
          {debugLog.length ? debugLog.join("\n") : "debug=1 · click the canvas"}
        </pre>
      )}
    </div>
  );
}
