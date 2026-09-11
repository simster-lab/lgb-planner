import { useRef, useState } from "react";
import { useEditor } from "../editor/store";
import { mqttService } from "../mqtt/client";
import { defaultBrokerConfig } from "../model/types";
import {
  circuitNameFromFilename,
  downloadLayout,
  readLayoutFile,
  sanitizeCircuitName,
} from "../persist/io";
import {
  deleteNamedCircuit,
  importCircuit,
  listCircuits,
  loadNamedCircuit,
  saveNamedCircuit,
} from "../persist/remote";

export function Toolbar() {
  const { layout, mqttStatus, circuitName, dispatch } = useEditor();
  const importRef = useRef<HTMLInputElement>(null);
  const mqtt = layout.settings.mqtt ?? defaultBrokerConfig();
  const [openOpen, setOpenOpen] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshNames = async () => {
    const list = await listCircuits();
    setNames(list ?? []);
    return list;
  };

  const openPicker = async () => {
    const list = await refreshNames();
    if (list === undefined) {
      alert("Unraid circuit storage is not available. Use Import from this computer.");
      return;
    }
    setOpenOpen(true);
  };

  const loadNamed = async (name: string) => {
    setBusy(true);
    try {
      const loaded = await loadNamedCircuit(name);
      if (!loaded) {
        alert(`Could not open ${name}.`);
        return;
      }
      dispatch({ type: "loadLayout", layout: loaded.layout, name });
      setOpenOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!circuitName) {
      await saveAs();
      return;
    }
    setBusy(true);
    try {
      if (!(await saveNamedCircuit(circuitName, layout))) {
        alert("Could not save that circuit on Unraid.");
      }
    } finally {
      setBusy(false);
    }
  };

  const saveAs = async () => {
    const typed = window.prompt("Save as (letters, numbers, hyphen, underscore)", circuitName ?? "layout");
    if (typed == null) return;
    const name = sanitizeCircuitName(typed);
    if (!name) {
      alert("Use a name like yard-1 (letters, numbers, hyphen, underscore).");
      return;
    }
    const existing = await listCircuits();
    if (existing?.includes(name) && !confirm(`Replace ${name} on Unraid?`)) return;
    setBusy(true);
    try {
      if (!(await saveNamedCircuit(name, layout))) {
        alert("Could not save that circuit on Unraid.");
        return;
      }
      dispatch({ type: "setCircuitName", name });
    } finally {
      setBusy(false);
    }
  };

  const removeNamed = async (name: string) => {
    if (!confirm(`Delete ${name} from Unraid?`)) return;
    setBusy(true);
    try {
      if (!(await deleteNamedCircuit(name))) {
        alert("Could not delete that circuit.");
        return;
      }
      if (circuitName === name) dispatch({ type: "setCircuitName", name: null });
      await refreshNames();
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <strong>LGB Planner</strong>
        <span>G scale · 45 mm</span>
        <span className="build">
          {circuitName ?? "unsaved"} · build {__BUILD_TIME__}
        </span>
      </div>
      <div className="toolbar-actions">
        <button
          type="button"
          onClick={() => {
            if (layout.pieces.length > 0 && !confirm("Start a new circuit? Unsaved edits stay in the last Unraid save or download.")) {
              return;
            }
            dispatch({ type: "newLayout" });
          }}
        >
          New
        </button>
        <button type="button" onClick={() => void openPicker()}>
          Open
        </button>
        <button type="button" disabled={busy} onClick={() => void save()}>
          Save
        </button>
        <button type="button" disabled={busy} onClick={() => void saveAs()}>
          Save as
        </button>
        <button type="button" onClick={() => importRef.current?.click()}>
          Import
        </button>
        <button
          type="button"
          onClick={() => downloadLayout(layout, `${circuitName ?? "layout"}.lgb.json`)}
        >
          Download
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json,.lgb.json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              const imported = await readLayoutFile(file);
              const suggested = circuitNameFromFilename(file.name);
              const typed = window.prompt("Name on Unraid", suggested);
              if (typed == null) {
                dispatch({ type: "loadLayout", layout: imported, name: null });
                return;
              }
              const name = sanitizeCircuitName(typed) ?? suggested;
              const existing = await listCircuits();
              if (existing?.includes(name) && !confirm(`Replace ${name} on Unraid?`)) return;
              const stored = await importCircuit(name, imported);
              dispatch({
                type: "loadLayout",
                layout: stored?.layout ?? imported,
                name: stored?.name ?? name,
              });
            } catch {
              alert("Could not read that circuit file.");
            }
          }}
        />
        <button
          type="button"
          className={mqttStatus === "connected" ? "active" : ""}
          onClick={() => {
            if (mqttService.isConnected()) mqttService.disconnect();
            else mqttService.connect(mqtt);
          }}
        >
          {mqttStatus === "connected" ? "MQTT connected" : "MQTT connect"}
        </button>
        <button type="button" onClick={() => dispatch({ type: "setSettingsOpen", open: true })}>
          Settings
        </button>
      </div>
      {openOpen ? (
        <div className="modal-backdrop" onClick={() => setOpenOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Open circuit</h2>
            <p className="hint">
              Named files on Unraid under the data folder. Import copies a file from this computer onto
              the array.
            </p>
            {names.length === 0 ? (
              <p className="hint">No saved circuits yet. Use Save as or Import.</p>
            ) : (
              <ul className="circuit-list">
                {names.map((name) => (
                  <li key={name}>
                    <button type="button" className="primary" disabled={busy} onClick={() => void loadNamed(name)}>
                      {name}
                    </button>
                    <button type="button" className="danger" disabled={busy} onClick={() => void removeNamed(name)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="row">
              <button type="button" onClick={() => setOpenOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
