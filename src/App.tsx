import { useEffect } from "react";
import { EditorCanvas } from "./editor/Canvas";
import { flipPiece } from "./editor/pieceFactory";
import { EditorProvider, useEditor } from "./editor/store";
import { mqttService } from "./mqtt/client";
import { dccexService } from "./dccex/client";
import { Inspector } from "./ui/Inspector";
import { Palette } from "./ui/Palette";
import { Settings } from "./ui/Settings";
import { Throttle } from "./ui/Throttle";
import { Toolbar } from "./ui/Toolbar";
import "./App.css";

function EditorApp() {
  const { layout, selectedIds, placing, pasting, editorMode, dispatch, replacePiece, replacePieces, settingsOpen } =
    useEditor();

  useEffect(() => {
    mqttService.onStatus((status, message) => {
      dispatch({ type: "setMqttStatus", status, message });
    });
    dccexService.onStatus((status, message) => {
      dispatch({ type: "setDccexStatus", status, message });
    });
    mqttService.onMessage((topic, payload) => {
      for (const piece of layout.pieces) {
        if (!piece.mqtt?.statusTopic || piece.mqtt.statusTopic !== topic) continue;
        if (piece.type === "point") {
          if (payload === piece.mqtt.payloadThrough) {
            dispatch({ type: "previewPiece", piece: { ...piece, pointState: "through" } });
          } else if (payload === piece.mqtt.payloadDiverge) {
            dispatch({ type: "previewPiece", piece: { ...piece, pointState: "diverge" } });
          }
        }
        if (piece.type === "signal") {
          if (payload === (piece.mqtt.payloadDanger ?? "danger")) {
            dispatch({ type: "previewPiece", piece: { ...piece, signalState: "danger" } });
          } else if (payload === (piece.mqtt.payloadClear ?? "clear")) {
            dispatch({ type: "previewPiece", piece: { ...piece, signalState: "clear" } });
          }
        }
      }
    });
  }, [dispatch, layout.pieces]);

  useEffect(() => {
    const topics = layout.pieces
      .map((piece) => piece.mqtt?.statusTopic?.trim() ?? "")
      .filter(Boolean);
    mqttService.resubscribe(topics);
  }, [layout.pieces]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !typing) {
        const key = event.key.toLowerCase();
        if (key === "a") {
          event.preventDefault();
          if (editorMode === "plan") dispatch({ type: "selectAll" });
          return;
        }
        if (key === "c" && selectedIds.length) {
          event.preventDefault();
          dispatch({ type: "copySelected" });
          return;
        }
        if (key === "v") {
          event.preventDefault();
          if (editorMode === "plan") dispatch({ type: "pasteClipboard" });
          return;
        }
      }
      if (typing) return;
      if (event.key === "Escape") {
        dispatch({ type: "setPlacing", placing: null });
        dispatch({ type: "setPasting", pieces: null });
        dispatch({ type: "select", id: null });
        return;
      }
      if (editorMode !== "plan") return;
      if (pasting) {
        if (event.key.toLowerCase() === "r") {
          event.preventDefault();
          dispatch({ type: "rotatePasting", degrees: event.shiftKey ? -90 : 90 });
        }
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length) {
        dispatch({ type: "deleteSelected" });
      }
      if (event.key.toLowerCase() === "f" && !placing && selectedIds.length) {
        const flipped = layout.pieces.filter((piece) => selectedIds.includes(piece.id)).map(flipPiece);
        if (flipped.length === 1) replacePiece(flipped[0]);
        else if (flipped.length) replacePieces(flipped);
      }
      if (event.key.toLowerCase() === "r" && !placing && selectedIds.length) {
        event.preventDefault();
        dispatch({ type: "rotateSelected", degrees: event.shiftKey ? -90 : 90 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, editorMode, layout.pieces, pasting, placing, replacePiece, replacePieces, selectedIds]);

  useEffect(() => {
    return () => {
      mqttService.disconnect();
      dccexService.disconnect();
    };
  }, []);

  return (
    <div className={`app ${editorMode === "run" ? "has-throttle" : ""}`}>
      <Toolbar />
      <div className={`workspace ${editorMode}`}>
        {editorMode === "plan" ? <Palette /> : null}
        <EditorCanvas />
        <Inspector />
      </div>
      {editorMode === "run" ? <Throttle /> : null}
      {settingsOpen ? <Settings /> : null}
    </div>
  );
}

export default function App() {
  return (
    <EditorProvider>
      <EditorApp />
    </EditorProvider>
  );
}
