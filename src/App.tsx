import { useEffect } from "react";
import { EditorCanvas } from "./editor/Canvas";
import { flipPiece } from "./editor/pieceFactory";
import { EditorProvider, useEditor } from "./editor/store";
import { mqttService } from "./mqtt/client";
import { Inspector } from "./ui/Inspector";
import { Palette } from "./ui/Palette";
import { Settings } from "./ui/Settings";
import { Toolbar } from "./ui/Toolbar";
import "./App.css";

function EditorApp() {
  const { layout, selected, placing, dispatch, replacePiece, settingsOpen } = useEditor();

  useEffect(() => {
    mqttService.onStatus((status, message) => {
      dispatch({ type: "setMqttStatus", status, message });
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
      if (typing) return;
      if (event.key === "Escape") {
        dispatch({ type: "setPlacing", placing: null });
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected) {
        dispatch({ type: "deleteSelected" });
      }
      if (event.key.toLowerCase() === "f") {
        if (placing) {
          dispatch({
            type: "setPlacing",
            placing: { ...placing, hand: placing.hand === "right" ? "left" : "right" },
          });
        } else if (selected) {
          replacePiece(flipPiece(selected));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, placing, replacePiece, selected]);

  useEffect(() => {
    return () => mqttService.disconnect();
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <Palette />
        <EditorCanvas />
        <Inspector />
      </div>
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
