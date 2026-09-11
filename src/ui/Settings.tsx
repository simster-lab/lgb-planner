import { useState } from "react";
import { useEditor } from "../editor/store";
import { mqttService } from "../mqtt/client";
import { defaultBrokerConfig } from "../model/types";
import type { BrokerConfig } from "../model/types";

export function Settings() {
  const { layout, mqttStatus, mqttError, dispatch } = useEditor();
  const current = layout.settings.mqtt ?? defaultBrokerConfig();
  const [draft, setDraft] = useState<BrokerConfig>(current);

  const set = <K extends keyof BrokerConfig>(key: K, value: BrokerConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div
      className="modal-backdrop"
      onClick={() => dispatch({ type: "setSettingsOpen", open: false })}
    >
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>MQTT broker</h2>
        <p className="hint">
          Same as Node-RED: MQTT over TCP (usually port <code>1883</code>). This page talks to the
          planner container; the container connects to Mosquitto. No WebSocket listener is required
          on the broker.
        </p>

        <label className="field">
          <span>Host</span>
          <input value={draft.host} onChange={(event) => set("host", event.target.value)} />
        </label>
        <label className="field">
          <span>Port</span>
          <input
            type="number"
            value={draft.port}
            onChange={(event) => set("port", Number(event.target.value) || 1883)}
          />
        </label>
        <label className="field">
          <span>Client ID</span>
          <input value={draft.clientId} onChange={(event) => set("clientId", event.target.value)} />
        </label>
        <label className="field">
          <span>Username</span>
          <input value={draft.username} onChange={(event) => set("username", event.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={draft.password}
            onChange={(event) => set("password", event.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.tls}
            onChange={(event) => set("tls", event.target.checked)}
          />
          Use TLS (mqtts)
        </label>

        <p className={`status ${mqttStatus}`}>
          Status: {mqttStatus}
          {mqttError ? ` — ${mqttError}` : ""}
        </p>
        <p className="hint">
          Connected means the planner container reached the broker. A message is only sent when you
          flick a point/signal, press Through/Diverge or Danger/Clear, or Send test below. Editing a
          topic name does not publish.
        </p>

        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => {
              dispatch({ type: "setMqttSettings", mqtt: draft });
              mqttService.connect(draft);
            }}
          >
            Save & connect
          </button>
          <button
            type="button"
            disabled={mqttStatus !== "connected"}
            onClick={() => mqttService.publish("lgb-planner/test", "ping")}
          >
            Send test
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "setMqttSettings", mqtt: draft });
              mqttService.disconnect();
              dispatch({ type: "setSettingsOpen", open: false });
            }}
          >
            Save
          </button>
          <button type="button" onClick={() => dispatch({ type: "setSettingsOpen", open: false })}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
