import { pieceLabel } from "../catalog/lgb";
import { flipPiece } from "../editor/pieceFactory";
import { useEditor } from "../editor/store";
import { mqttService } from "../mqtt/client";

export function Inspector() {
  const { selected, updatePiece, previewPiece, replacePiece, dispatch, mqttStatus } = useEditor();

  if (!selected) {
    return (
      <aside className="panel inspector">
        <h2>Inspector</h2>
        <p className="hint">Select a piece to rename it, edit length, or set MQTT topics.</p>
      </aside>
    );
  }

  return (
    <aside className="panel inspector">
      <h2>Inspector</h2>
      <p className="meta">{pieceLabel(selected)}</p>

      <label className="field">
        <span>Name</span>
        <input
          type="text"
          value={selected.name ?? ""}
          placeholder={pieceLabel(selected)}
          onChange={(event) => previewPiece({ ...selected, name: event.target.value })}
        />
      </label>

      {selected.type === "straight" && (
        <label className="field">
          <span>Length (mm)</span>
          <input
            type="number"
            min={10}
            max={8000}
            value={selected.lengthMm ?? 300}
            onChange={(event) =>
              previewPiece({
                ...selected,
                lengthMm: Math.max(1, Number(event.target.value) || 300),
              })
            }
          />
        </label>
      )}

      <div className="row">
        <button type="button" onClick={() => replacePiece(flipPiece(selected))}>
          Flip
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => dispatch({ type: "deleteSelected" })}
        >
          Delete
        </button>
      </div>

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
