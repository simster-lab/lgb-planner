import { pieceLabel } from "../catalog/lgb";
import { flipPiece } from "../editor/pieceFactory";
import { rfidNameOppositeForSide, rfidNameSide } from "../editor/render";
import { useEditor } from "../editor/store";
import { mqttService } from "../mqtt/client";
import { DEFAULT_RFID_FADE_MS } from "../model/types";
import { DraftNumberInput } from "./DraftNumberInput";

export function Inspector() {
  const {
    selected,
    selectedIds,
    layout,
    updatePiece,
    previewPiece,
    replacePiece,
    replacePieces,
    dispatch,
    mqttStatus,
    editorMode,
    clipboard,
  } = useEditor();
  const plan = editorMode === "plan";

  if (!selected) {
    return (
      <aside className="panel inspector">
        <h2>Inspector</h2>
        <p className="hint">
          {plan
            ? "Box-select or Shift+click to group. Ctrl+C copies. Ctrl+V pastes onto the cursor — click to drop, R to rotate."
            : "Click a point or signal to throw it. MQTT publishes if connected."}
        </p>
        {plan && clipboard.length > 0 ? (
          <div className="row">
            <button type="button" onClick={() => dispatch({ type: "pasteClipboard" })}>
              Paste
            </button>
          </div>
        ) : null}
      </aside>
    );
  }

  return (
    <aside className="panel inspector">
      <h2>Inspector</h2>
      <p className="meta">{pieceLabel(selected)}</p>
      {selectedIds.length > 1 ? <p className="hint">{selectedIds.length} selected</p> : null}

      <label className="field">
        <span>Name</span>
        <input
          type="text"
          value={selected.name ?? ""}
          placeholder={pieceLabel(selected)}
          onChange={(event) => previewPiece({ ...selected, name: event.target.value })}
        />
      </label>

      {plan && (selected.type === "point" || selected.type === "rfid") && (
        <label className="check">
          <input
            type="checkbox"
            checked={
              layout.pieces
                .filter(
                  (piece) =>
                    selectedIds.includes(piece.id) &&
                    (piece.type === selected.type),
                )
                .every((piece) => piece.showName)
            }
            onChange={(event) => {
              const showName = event.target.checked;
              const named = layout.pieces.filter(
                (piece) => selectedIds.includes(piece.id) && piece.type === selected.type,
              );
              if (named.length > 1) {
                replacePieces(named.map((piece) => ({ ...piece, showName })));
              } else {
                updatePiece(selected.id, { showName });
              }
            }}
          />
          Show name on map
        </label>
      )}

      {plan && selected.type === "rfid" && selected.showName && (
        <div className="row">
          {(() => {
            const side = rfidNameSide(selected, layout.pieces);
            const vertical = side === "left" || side === "right";
            const options = vertical
              ? (["right", "left"] as const)
              : (["above", "below"] as const);
            const labels = { above: "Above", below: "Below", left: "Left", right: "Right" };
            return options.map((option) => (
              <button
                key={option}
                type="button"
                className={side === option ? "active" : ""}
                onClick={() => {
                  const sensors = layout.pieces.filter(
                    (piece) => selectedIds.includes(piece.id) && piece.type === "rfid",
                  );
                  const next = sensors.map((piece) => ({
                    ...piece,
                    nameOpposite: rfidNameOppositeForSide(piece, layout.pieces, option) || undefined,
                  }));
                  if (next.length > 1) replacePieces(next);
                  else updatePiece(selected.id, { nameOpposite: next[0]?.nameOpposite });
                }}
              >
                {labels[option]}
              </button>
            ));
          })()}
        </div>
      )}

      {plan && selected.type === "point" && (
        <label className="check">
          <input
            type="checkbox"
            checked={
              layout.pieces
                .filter((piece) => selectedIds.includes(piece.id) && piece.type === "point")
                .every((piece) => piece.leverInside)
            }
            onChange={(event) => {
              const leverInside = event.target.checked;
              const points = layout.pieces.filter(
                (piece) => selectedIds.includes(piece.id) && piece.type === "point",
              );
              if (points.length > 1) {
                replacePieces(points.map((piece) => ({ ...piece, leverInside })));
              } else {
                updatePiece(selected.id, { leverInside });
              }
            }}
          />
          Lever inside
        </label>
      )}

      {plan && selected.type === "straight" && (
        <label className="field">
          <span>Length (mm)</span>
          <DraftNumberInput
            value={selected.lengthMm ?? 300}
            min={10}
            max={8000}
            onValue={(next) => {
              if (next == null) return;
              previewPiece({ ...selected, lengthMm: next });
            }}
          />
        </label>
      )}

      {plan && (
        <div className="row">
          <button
            type="button"
            onClick={() => {
              const flipped = layout.pieces
                .filter((piece) => selectedIds.includes(piece.id))
                .map(flipPiece);
              if (flipped.length === 1) replacePiece(flipped[0]);
              else if (flipped.length) replacePieces(flipped);
            }}
          >
            Flip
          </button>
          <button type="button" onClick={() => dispatch({ type: "rotateSelected", degrees: 90 })}>
            Rotate 90°
          </button>
          <button type="button" onClick={() => dispatch({ type: "copySelected" })}>
            Copy
          </button>
          <button
            type="button"
            disabled={clipboard.length === 0}
            onClick={() => dispatch({ type: "pasteClipboard" })}
          >
            Paste
          </button>
          <button type="button" className="danger" onClick={() => dispatch({ type: "deleteSelected" })}>
            Delete
          </button>
        </div>
      )}

      {selected.type === "point" && (
        <>
          <h3>Point</h3>
          <div className="row">
            <button
              type="button"
              className={selected.pointState !== "diverge" ? "active" : ""}
              onClick={() => {
                updatePiece(selected.id, { pointState: "through" });
                if (selected.mqtt?.topic) {
                  mqttService.publish(selected.mqtt.topic, selected.mqtt.payloadThrough);
                }
              }}
            >
              Through
            </button>
            <button
              type="button"
              className={selected.pointState === "diverge" ? "active" : ""}
              onClick={() => {
                updatePiece(selected.id, { pointState: "diverge" });
                if (selected.mqtt?.topic) {
                  mqttService.publish(selected.mqtt.topic, selected.mqtt.payloadDiverge);
                }
              }}
            >
              Diverge
            </button>
          </div>
          <p className="hint">
            Or flick the lever on the point. MQTT {mqttStatus === "connected" ? "will publish" : "is offline"}.
          </p>

          {plan && (
            <>
              <h3>MQTT</h3>
              <label className="field">
                <span>Command topic</span>
                <input
                  type="text"
                  value={selected.mqtt?.topic ?? ""}
                  placeholder="garden/points/yard-1/set"
                  onChange={(event) =>
                    previewPiece({
                      ...selected,
                      mqtt: { ...emptyMqtt(selected), topic: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Payload — through</span>
                <input
                  type="text"
                  value={selected.mqtt?.payloadThrough ?? "through"}
                  onChange={(event) =>
                    previewPiece({
                      ...selected,
                      mqtt: { ...emptyMqtt(selected), payloadThrough: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Payload — diverge</span>
                <input
                  type="text"
                  value={selected.mqtt?.payloadDiverge ?? "diverge"}
                  onChange={(event) =>
                    previewPiece({
                      ...selected,
                      mqtt: { ...emptyMqtt(selected), payloadDiverge: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Status topic (optional)</span>
                <input
                  type="text"
                  value={selected.mqtt?.statusTopic ?? ""}
                  placeholder="garden/points/yard-1/state"
                  onChange={(event) =>
                    previewPiece({
                      ...selected,
                      mqtt: { ...emptyMqtt(selected), statusTopic: event.target.value },
                    })
                  }
                />
              </label>
            </>
          )}
        </>
      )}

      {selected.type === "signal" && (
        <>
          <h3>Signal</h3>
          <div className="row">
            <button
              type="button"
              className={selected.signalState !== "clear" ? "active" : ""}
              onClick={() => {
                updatePiece(selected.id, { signalState: "danger" });
                if (selected.mqtt?.topic) {
                  mqttService.publish(selected.mqtt.topic, selected.mqtt.payloadDanger ?? "danger");
                }
              }}
            >
              Danger
            </button>
            <button
              type="button"
              className={selected.signalState === "clear" ? "active" : ""}
              onClick={() => {
                updatePiece(selected.id, { signalState: "clear" });
                if (selected.mqtt?.topic) {
                  mqttService.publish(selected.mqtt.topic, selected.mqtt.payloadClear ?? "clear");
                }
              }}
            >
              Clear
            </button>
          </div>
          <p className="hint">
            Or click the signal head. MQTT {mqttStatus === "connected" ? "will publish" : "is offline"}.
          </p>

          {plan && (
            <>
              <h3>MQTT</h3>
              <label className="field">
                <span>Command topic</span>
                <input
                  type="text"
                  value={selected.mqtt?.topic ?? ""}
                  placeholder="garden/signals/home-1/set"
                  onChange={(event) =>
                    previewPiece({
                      ...selected,
                      mqtt: { ...emptyMqtt(selected), topic: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Payload — danger</span>
                <input
                  type="text"
                  value={selected.mqtt?.payloadDanger ?? "danger"}
                  onChange={(event) =>
                    previewPiece({
                      ...selected,
                      mqtt: { ...emptyMqtt(selected), payloadDanger: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Payload — clear</span>
                <input
                  type="text"
                  value={selected.mqtt?.payloadClear ?? "clear"}
                  onChange={(event) =>
                    previewPiece({
                      ...selected,
                      mqtt: { ...emptyMqtt(selected), payloadClear: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Status topic (optional)</span>
                <input
                  type="text"
                  value={selected.mqtt?.statusTopic ?? ""}
                  placeholder="garden/signals/home-1/state"
                  onChange={(event) =>
                    previewPiece({
                      ...selected,
                      mqtt: { ...emptyMqtt(selected), statusTopic: event.target.value },
                    })
                  }
                />
              </label>
            </>
          )}
        </>
      )}

      {selected.type === "rfid" && (
        <>
          <h3>RFID sensor</h3>
          <p className="hint">
            Snaps onto a track piece. MQTT tag payload looks up the roster name
            {mqttStatus === "connected" ? "" : " once MQTT is connected"}.
          </p>
          {plan && (
            <>
              <h3>MQTT</h3>
              <label className="field">
                <span>Status topic</span>
                <input
                  type="text"
                  value={selected.mqtt?.statusTopic ?? ""}
                  placeholder="garden/rfid/bridge-1"
                  onChange={(event) =>
                    previewPiece({
                      ...selected,
                      mqtt: { ...emptyMqtt(selected), statusTopic: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Fade ({Math.round((selected.fadeMs ?? DEFAULT_RFID_FADE_MS) / 100) / 10} s)</span>
                <input
                  type="range"
                  min={500}
                  max={15000}
                  step={100}
                  value={selected.fadeMs ?? DEFAULT_RFID_FADE_MS}
                  onChange={(event) =>
                    previewPiece({
                      ...selected,
                      fadeMs: Number(event.target.value),
                    })
                  }
                />
              </label>
            </>
          )}
        </>
      )}
    </aside>
  );
}

function emptyMqtt(selected: {
  mqtt?: {
    topic: string;
    payloadThrough: string;
    payloadDiverge: string;
    payloadDanger?: string;
    payloadClear?: string;
    statusTopic?: string;
  };
}) {
  return {
    topic: selected.mqtt?.topic ?? "",
    payloadThrough: selected.mqtt?.payloadThrough ?? "through",
    payloadDiverge: selected.mqtt?.payloadDiverge ?? "diverge",
    payloadDanger: selected.mqtt?.payloadDanger ?? "danger",
    payloadClear: selected.mqtt?.payloadClear ?? "clear",
    statusTopic: selected.mqtt?.statusTopic ?? "",
  };
}
