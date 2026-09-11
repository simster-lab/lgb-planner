# Install LGB Planner on Unraid

The planner is a small web UI. Your existing Mosquitto (or other) container stays as it is. The **planner container** connects to the broker with MQTT over TCP (the same as Node-RED, usually port **1883**). The browser only opens a WebSocket to this planner (`ws://TOWER:8080/mqtt`). Mosquitto does **not** need a WebSocket listener.

```
Phone / PC  -->  http://TOWER:8080  (this container; WS /mqtt stays here)
This container  -->  mqtt://192.168.0.2:1883  (your broker, like Node-RED)
```

Use a **LAN IP or hostname** for the broker (the Unraid server, or whatever device runs Mosquitto). Do not use `localhost` unless Mosquitto runs in the **same** container (it does not). Docker-internal names such as `mosquitto` only work if both containers share a user-defined network.

Circuits (the track plan, names, MQTT topics, and Settings host/port) are saved under an **appdata data folder**. Live MQTT publishes still go to Mosquitto and are not stored by this app.

```
Phone / PC  -->  Open / Save / Import / Download
This container  -->  /mnt/user/appdata/lgb-planner/data
```

## 1. Prerequisites

- Unraid with Docker enabled.
- A broker already running with a **TCP** MQTT listener (port **1883** is what Node-RED uses). No extra WebSocket config is required.

Note:

- LAN address, e.g. `192.168.0.2`
- TCP port (usually `1883`)
- Username/password only if the broker requires them

## 2. Copy the project onto Unraid

SSH or **Terminal** in the Unraid web UI:

```bash
mkdir -p /mnt/user/appdata/lgb-planner
```

Clone or copy this repository into that folder so `Dockerfile` is at `/mnt/user/appdata/lgb-planner/Dockerfile`.

## 3. Build the image

The image name is **`lgb-planner`** (LGB, then hyphen, then planner). It is easy to mistype as `lbg-planner`. The Unraid **Repository** field in the next step must match this tag **exactly**.

```bash
cd /mnt/user/appdata/lgb-planner
docker build -t lgb-planner .
```

Wait until the last lines look like `Successfully tagged lgb-planner:latest` (wording varies slightly by Docker version). Then confirm it is local:

```bash
docker images lgb-planner
```

You should see a row with `REPOSITORY` = `lgb-planner` and `TAG` = `latest`. If that command prints no rows, the build did not tag the name you think it did — do not go on to Add Container yet.

This image is **only on this server**. It is not on Docker Hub. If Unraid later says `pull access denied`, it is trying to download a name that does not exist locally (almost always a typo in Repository).

## 4. Add the container (Unraid UI)

Open **Docker** → **Add Container**. Switch **Advanced View** on (top right) so you can see Registry URL and extra options.

Leave the template as blank / none (this is not a Community Applications app).

Fill the fields in this order:

### Name vs Repository

These are different fields.

| Field | What to type | What it is |
| --- | --- | --- |
| **Name** | `LGB-Planner` (or anything you like) | Container name in the Unraid list. Unraid often capitalises this. It does **not** have to match the image. |
| **Repository** | `lgb-planner:latest` | The image you built in step 3. Must match `docker images` exactly. |
| **Registry URL** | *leave empty* | If this is `https://hub.docker.com/` or similar, Unraid will try to pull from the internet and fail. |

Do **not** type `lbg-planner`. Do not type `docker.io/lgb-planner` unless you have actually published the image.

If your Unraid build has a checkbox such as **Always pull image**, leave it **off**. A pull will look on Docker Hub, not at the local build.

### Network, restart, WebUI

| Field | Value |
| --- | --- |
| Network Type | Bridge |
| Restart policy | Unless Stopped |
| Extra Parameters | leave empty |
| WebUI | `http://[IP]:[PORT:8080]/` |

### Port

Click **Add another Path, Port, Variable, Label or Device** → **Port**:

| Field | Value |
| --- | --- |
| Name | `WebUI` (optional label) |
| Container Port | `8080` |
| Host Port | `8080` if free, otherwise e.g. `8085` |
| Connection Type | TCP |

Only **one** published port is required. Do not map 1883 on this container. Mosquitto already has 1883.

Unraid should produce `-p '8085:8080/tcp'` (or `8080:8080`). The **container** port must stay **8080**. Open `http://TOWER:8085` if the host port is 8085. WebUI URL stays `http://[IP]:[PORT:8080]/` so Unraid fills in the host port automatically.

### MQTT environment variables (optional)

These seed **Settings** (and the container’s TCP connection) when the browser has no saved broker yet.

For each row: **Add another…** → **Variable**.

| Key | Example value | Meaning |
| --- | --- | --- |
| `MQTT_HOST` | `192.168.0.2` | Broker address **this container** can reach |
| `MQTT_PORT` | `1883` | MQTT TCP port (same as Node-RED) |
| `MQTT_TLS` | `false` | `true` for `mqtts://` |
| `MQTT_USER` | | optional |
| `MQTT_PASSWORD` | | optional |

`MQTT_PATH` is unused (the browser always uses `/mqtt` on this container).

### Data path (circuits)

Click **Add another…** → **Path**:

| Field | Value |
| --- | --- |
| Name | `data` |
| Container Path | `/data` |
| Host Path | `/mnt/user/appdata/lgb-planner/data` |

The git/source tree used for `docker build` is **not** this folder. Circuits land in `data/current.lgb.json` and `data/layouts/<name>.lgb.json`.

**Open / Save / Save as** use those Unraid files. **Import** copies a `.lgb.json` from this computer onto the array and loads it. **Download** saves a copy onto this computer (USB/backup); it is not a substitute for Save.

MQTT *messages* (point throws, Send test) still go to Mosquitto. Saving a circuit **does** keep broker host/port and per-piece topics in that JSON.

### Check the command preview, then Apply

The generated command at the bottom must end with the **local** image name, for example:

```
-p '8080:8080/tcp'
  -e MQTT_HOST="192.168.1.50"
  'lgb-planner:latest'
```

If the last token is `'lbg-planner'` or `'lbg-planner:latest'`, fix **Repository** before you click Apply.

Click **Apply**. Unraid should **not** print `Unable to find image` or `pull access denied`. It should start the container.

If Apply already failed, you do not need to rebuild. Edit the same container (or Add Container again), set **Repository** to `lgb-planner:latest`, confirm `docker images lgb-planner` still lists it, and Apply again.

## 5. Equivalent `docker run`

Same image name as step 3:

```bash
docker run -d --name LGB-Planner --restart unless-stopped \
  -p 8080:8080 \
  -v /mnt/user/appdata/lgb-planner/data:/data \
  -e MQTT_HOST=192.168.0.2 \
  -e MQTT_PORT=1883 \
  -e MQTT_TLS=false \
  lgb-planner:latest
```

## 6. First launch

1. Open `http://TOWER:8080` (use your Unraid hostname or IP, e.g. `http://Downings:8080` or `http://192.168.x.x:8080`).
2. Open **Settings**. Host `192.168.0.2` and port `1883` (same as Node-RED), or type them in. Leave user/password empty if the broker allows anonymous.
3. Click **Save & connect** (or **MQTT connect** on the toolbar).
4. Place a point, set its command topic in the inspector, flick the lever.
5. **Save as** a name (e.g. `yard`) so the circuit is on the array. Other browsers on the LAN then **Open** that file.

If Settings still shows `localhost` or port `9001`, this browser already had a saved layout. Edit host/port to match Node-RED and save (that is now also written into the Unraid circuit JSON).

## 7. Updates (browser refresh does nothing)

The PC project and Unraid are **two copies**. Editing files on your PC, or pressing Shift+F5 in the browser, does not change what the container is serving.

A running container is glued to the image id it was **created** with. **Stop / Start does not pick up a new `docker build`.** You must copy files onto Unraid, rebuild, **remove** the container, then Apply the template again.

### On Unraid (terminal)

1. Copy the latest project into `/mnt/user/appdata/lgb-planner` (USB, `scp`, Syncthing, `git pull` — whatever you use). Confirm the Unraid copy is new:

```bash
grep __BUILD_TIME__ /mnt/user/appdata/lgb-planner/src/ui/Toolbar.tsx
```

If that prints nothing, Unraid still has the old source. Do not build yet.

2. Rebuild and drop the old container:

```bash
cd /mnt/user/appdata/lgb-planner
chmod +x scripts/unraid-update.sh
./scripts/unraid-update.sh
```

Or by hand:

```bash
cd /mnt/user/appdata/lgb-planner
docker build --no-cache -t lgb-planner:latest .
docker stop LGB-Planner
docker rm LGB-Planner
```

3. In Unraid **Docker**, open your existing LGB-Planner template (Add Container → your saved template) and **Apply**. Same name, ports, env. Add the **data** path (`/mnt/user/appdata/lgb-planner/data` → `/data`) if it is not there yet. Repository stays `lgb-planner:latest`.

4. Open the planner (any browser). The toolbar must show a **new** `build YYYY-MM-DD HH:MM` (the time you ran `docker build` on Unraid). If it does not, the template did not recreate from the new image — check the command preview still ends with `lgb-planner:latest`.

Changing only `MQTT_*` variables: edit the container, Apply. No rebuild.

### Confirm image vs container

```bash
docker inspect --format 'container image: {{.Image}}' LGB-Planner
docker images -q lgb-planner:latest
```

Those ids must match. If they do not, you started an old container; go back to step 2.

## 8. Troubleshooting

### `Unable to find image 'lbg-planner:latest' locally` / `pull access denied`

Unraid is using a **Repository** name that is not on this server, so Docker tries Docker Hub and is refused.

1. In a terminal: `docker images lgb-planner` — you want `lgb-planner` / `latest`.
2. In the container template, set **Repository** to `lgb-planner:latest` (LGB, not LBG).
3. Clear **Registry URL**.
4. Turn **Always pull image** off if you have that option.
5. Apply again. You do not need to `docker build` a second time if the image is already listed.

**Name** (`LGB-Planner`) can stay as it is. Only **Repository** must match the image.

### Which build is this? / still the old page after refresh

Shift+F5 and a second browser only reload what the **container** is already serving. They cannot pull new source from your PC.

- No `build YYYY-MM-DD HH:MM` in the toolbar → this container was built **before** that stamp existed. You are not on the latest files.
- Stamp present but the minute never changes → Unraid was not given new source, or the container was only Stop/Started after `docker build`.

Follow [section 7](#7-updates-browser-refresh-does-nothing). Then open `http://TOWER:8080/?debug=1` for the click log.

### Other

| Symptom | Likely cause |
| --- | --- |
| Planner page will not load | Open the **host** port (`http://TOWER:8085` if you mapped 8085→8080). Log must say `listening on 0.0.0.0:8080`, not `:1883`. Do not add a container variable named `PORT`. Set `MQTT_HOST` to the broker LAN IP, not `localhost`. Recreate after rebuild. |
| MQTT stays disconnected | Container cannot reach `MQTT_HOST:1883` (wrong IP, firewall, or Mosquitto not listening on TCP) |
| MQTT shows connected, broker sees nothing | Connected is the TCP link. Publish only happens when you throw a point/signal, press Through/Diverge, or **Send test** (`lgb-planner/test` = `ping`). Changing the topic field does not send. Container log should print `MQTT out …` for each publish. |
| Circuit missing after recreate | Template has no Path `/data`. Add host `/mnt/user/appdata/lgb-planner/data` → container `/data`, Apply. |
| Two browsers overwrite each other | Last write wins. Use **Save as** names if you need separate circuits. |
| Works in Node-RED, not here | Saved Settings still have port `9001` — set **1883**, Save & connect |
| Status cycles connected / disconnected | Old image (browser WS to 1883). Rebuild and **recreate** the container |
| HTTPS reverse proxy, MQTT fails | Page is HTTPS so the planner WS is `wss` to the **same** proxy host, not to Mosquitto |

The planner container talks to Mosquitto over TCP (like Node-RED). If MQTT Explorer or Node-RED can use `192.168.0.2:1883`, this app can too after Settings use that host and port **and** this image includes the TCP bridge.
