# LGB G-scale track planner

Browser planner for LGB (G-scale, 45 mm) track with joiner snap and MQTT control of points and signals.

```bash
npm install
npm run bridge
npm run dev
```

`npm run bridge` starts the TCP MQTT bridge on port 8080. `npm run dev` is the Vite UI and proxies `/mqtt` and `/api` to that bridge.

Configure the broker in **Settings** the same way as Node-RED: host and **TCP port 1883** (no WebSocket listener on Mosquitto). Then name each point or signal and set its command topic / payloads in the inspector.

Circuits **autosave** to the planner server (`data/current.lgb.json` when the bridge is running). **Open / Save / Save as** are named files on that disk. **Import / Download** copy a `.lgb.json` to or from this computer.

## Docker / Unraid

```bash
docker compose up --build
```

Then open http://127.0.0.1:8080

Full Unraid install (build on the server, Add Container, env vars, MQTT notes): **[docs/unraid.md](docs/unraid.md)**. The Unraid **Repository** field must be exactly `lgb-planner:latest` (the local image tag), not a Docker Hub name. Settings use MQTT TCP **1883**, same as Node-RED.

Updates: copy new files onto Unraid, rebuild, **remove** the container, then Apply the template. Stop/Start and browser refresh keep the old image. See **[docs/unraid.md](docs/unraid.md)** section 7.
