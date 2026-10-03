import { useState } from "react";
import { useEditor } from "../editor/store";
import { mqttService } from "../mqtt/client";
import { dccexService } from "../dccex/client";
import { defaultBrokerConfig, defaultDccexConfig } from "../model/types";
import type { BrokerConfig, DccexConfig } from "../model/types";

export function Settings() {
  const { layout, mqttStatus, mqttError, dccexStatus, dccexError, dispatch } = useEditor();
  const current = layout.settings.mqtt ?? defaultBrokerConfig();
  const dccexCurrent = layout.settings.dccex ?? defaultDccexConfig();
  const [draft, setDraft] = useState<BrokerConfig>(current);
  const [dccexDraft, setDccexDraft] = useState<DccexConfig>(dccexCurrent);

  const set = <K extends keyof BrokerConfig>(key: K, value: BrokerConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const setDccex = <K extends keyof DccexConfig>(key: K, value: DccexConfig[K]) => {
    setDccexDraft((prev) => ({ ...prev, [key]: value }));
  };

  const saveAll = () => {
    dispatch({ type: "setMqttSettings", mqtt: draft });
    dispatch({ type: "setDccexSettings", dccex: dccexDraft });
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
              saveAll();
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
              saveAll();
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

        <h2>DCC-EX command station</h2>
        <p className="hint">
          LAN IP and native TCP port (usually <code>2560</code>). This page talks to the planner
          container; the container opens TCP to the command station. No extra Unraid port.
        </p>
        <label className="field">
          <span>Host</span>
          <input
            value={dccexDraft.host}
            placeholder="192.168.0.50"
            onChange={(event) => setDccex("host", event.target.value)}
          />
        </label>
        <label className="field">
          <span>Port</span>
          <input
            type="number"
            value={dccexDraft.port}
            onChange={(event) => setDccex("port", Number(event.target.value) || 2560)}
          />
        </label>
        <p className={`status ${dccexStatus}`}>
          Status: {dccexStatus}
          {dccexError ? ` — ${dccexError}` : ""}
        </p>
        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => {
              saveAll();
              dccexService.connect(dccexDraft);
            }}
          >
            Save & connect
          </button>
        </div>
      </div>
    </div>
  );
}
