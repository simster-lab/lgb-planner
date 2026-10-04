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

## 2. Data folder

SSH or **Terminal** in the Unraid web UI:

```bash
mkdir -p /mnt/user/appdata/lgb-planner/data
```

Unraid does **not** need a copy of this git repository, and it does not build the image. Circuits are stored in that `data` folder. The container comes from GitHub Container Registry.

## 3. Image

The image is **`ghcr.io/simster-lab/lgb-planner:latest`**. It is built on a PC and pushed to the GitHub repo’s container registry. Unraid only pulls it.

The name is easy to mistype as `lbg-planner`. The Unraid **Repository** field in the next step must match this name **exactly**.

## 4. Add the container (Unraid UI)

Open **Docker** → **Add Container**. Switch **Advanced View** on (top right) so you can see Registry URL and extra options.

Leave the template as blank / none (this is not a Community Applications app).

Fill the fields in this order:

### Name vs Repository

These are different fields.

| Field | What to type | What it is |
| --- | --- | --- |
| **Name** | `LGB-Planner` (or anything you like) | Container name in the Unraid list. Unraid often capitalises this. It does **not** have to match the image. |
| **Repository** | `ghcr.io/simster-lab/lgb-planner:latest` | The image on GitHub Container Registry. |
| **Registry URL** | *leave empty* | The host is already in the Repository name (`ghcr.io`). |
| **Icon URL** | `https://raw.githubusercontent.com/simster-lab/lgb-planner/main/docs/unraid-icon.png` | Docker tab icon. If this is empty, Unraid looks up the name on Docker Hub, fails, and **spams the syslog**. |

Do **not** type `lbg-planner`. Do **not** type `lgb-planner:latest` (that is a local tag, and this image is not published under that name).

Apply pulls the image. If Unraid says `pull access denied` or `denied`, the GitHub package is still private. On GitHub: **Packages → lgb-planner → Package settings → Change visibility → Public**. No login is required on Unraid once the package is public.

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

Circuits land in `data/current.lgb.json` and `data/layouts/<name>.lgb.json`. The image does not store them.

**Open / Save / Save as** use those Unraid files. **Import** copies a `.lgb.json` from this computer onto the array and loads it. **Download** saves a copy onto this computer (USB/backup); it is not a substitute for Save.

MQTT *messages* (point throws, Send test) still go to Mosquitto. Saving a circuit **does** keep broker host/port and per-piece topics in that JSON.

### Check the command preview, then Apply

The generated command at the bottom must end with the registry image, for example:

```
-p '8080:8080/tcp'
  -e MQTT_HOST="192.168.1.50"
  'ghcr.io/simster-lab/lgb-planner:latest'
```

If the last token is `'lgb-planner:latest'`, `'lbg-planner'`, or `'lbg-planner:latest'`, fix **Repository** before you click Apply.

Click **Apply**. Unraid pulls the image and starts the container.

If Apply already failed, edit the same container (or Add Container again), set **Repository** to `ghcr.io/simster-lab/lgb-planner:latest`, and Apply again.

## 5. Equivalent `docker run`

Same image name as step 3:

```bash
docker run -d --name LGB-Planner --restart unless-stopped \
  -p 8080:8080 \
  -v /mnt/user/appdata/lgb-planner/data:/data \
  -e MQTT_HOST=192.168.0.2 \
  -e MQTT_PORT=1883 \
  -e MQTT_TLS=false \
  ghcr.io/simster-lab/lgb-planner:latest
```

## 6. First launch

1. Open `http://TOWER:8080` (use your Unraid hostname or IP, e.g. `http://Downings:8080` or `http://192.168.x.x:8080`).
2. Open **Settings**. Host `192.168.0.2` and port `1883` (same as Node-RED), or type them in. Leave user/password empty if the broker allows anonymous.
3. Click **Save & connect** (or **MQTT connect** on the toolbar).
4. Place a point, set its command topic in the inspector, flick the lever.
5. **Save as** a name (e.g. `yard`) so the circuit is on the array. Other browsers on the LAN then **Open** that file.

If Settings still shows `localhost` or port `9001`, this browser already had a saved layout. Edit host/port to match Node-RED and save (that is now also written into the Unraid circuit JSON).

## 7. Updates (browser refresh does nothing)

Editing files on your PC, or pressing Shift+F5 in the browser, does not change what the container is serving. Unraid keeps running the image it last pulled.

**Stop / Start does not pull.** Publish a new image, then use Unraid’s update button so it pulls and recreates the container. The data path is kept.

### On the PC

One-time login (a GitHub personal access token with `write:packages`; it is not stored in this repo):

```bash
echo TOKEN | podman login --authfile "$HOME/.config/containers/auth.json" ghcr.io -u simster-lab --password-stdin
```

That file stays after a reboot. A plain `podman login` stores the token under `/run`, which is cleared when the PC restarts. Use `docker login` instead if `docker` is the command that exists on that PC. Podman is enough; you do not need both. Docker’s own login file already survives a reboot.

After the first push, set the package **public**: GitHub → **Packages → lgb-planner → Package settings → Change visibility**. Packages start private even when the git repo is public. A public package is what lets Unraid pull with no registry login.

Each update:

```bash
./scripts/publish-image.sh
```

That builds `linux/amd64` (Unraid’s architecture) and pushes `ghcr.io/simster-lab/lgb-planner:latest` as a Docker manifest. Podman’s usual OCI manifest is invisible to Unraid’s update check, which then says no update is available.

### On Unraid

1. If this container was created from a local `lgb-planner:latest` build, edit the template once: **Repository** `ghcr.io/simster-lab/lgb-planner:latest`, **Registry URL** empty, **Apply**. Keep the port, MQTT variables, and `/mnt/user/appdata/lgb-planner/data` → `/data` path.
2. Later: **Docker → Check for Updates → Update**.

Open the planner. The toolbar must show a **new** `build YYYY-MM-DD HH:MM` (the time `publish-image.sh` built the image). If it does not, Unraid is still on the previous image — Check for Updates again, and confirm the command preview ends with `ghcr.io/simster-lab/lgb-planner:latest`.

Changing only `MQTT_*` variables: edit the container, Apply. No new image.

`scripts/unraid-update.sh` only prints these steps. It does not build on the server.

## 8. Troubleshooting

### `Unable to find image` / `pull access denied` / `denied`

Unraid is not pulling `ghcr.io/simster-lab/lgb-planner:latest`, or the GitHub package is still private.

1. In the container template, set **Repository** to `ghcr.io/simster-lab/lgb-planner:latest` (LGB, not LBG; include `ghcr.io/simster-lab/`).
2. Clear **Registry URL**.
3. On GitHub, make the **lgb-planner** package public if this is the first publish.
4. Apply again.

**Name** (`LGB-Planner`) can stay as it is. Only **Repository** must match the image.

### Which build is this? / still the old page after refresh

Shift+F5 and a second browser only reload what the **container** is already serving. They cannot pull a new image.

- No `build YYYY-MM-DD HH:MM` in the toolbar → this container is an image from before that stamp existed.
- Stamp present but the minute never changes → Unraid did not pull the image you just pushed, or the container was only Stop/Started.

Follow [section 7](#7-updates-browser-refresh-does-nothing). Then open `http://TOWER:8080/?debug=1` for the click log.

### Other

| Symptom | Likely cause |
| --- | --- |
| Planner page will not load | Open the **host** port (`http://TOWER:8085` if you mapped 8085→8080). Log must say `listening on 0.0.0.0:8080`, not `:1883`. Do not add a container variable named `PORT`. Set `MQTT_HOST` to the broker LAN IP, not `localhost`. Update the container after a new image. |
| MQTT stays disconnected | Container cannot reach `MQTT_HOST:1883` (wrong IP, firewall, or Mosquitto not listening on TCP) |
| MQTT shows connected, broker sees nothing | Connected is the TCP link. Publish only happens when you throw a point/signal, press Through/Diverge, or **Send test** (`lgb-planner/test` = `ping`). Changing the topic field does not send. Container log should print `MQTT out …` for each publish. |
| Circuit missing after recreate | Template has no Path `/data`. Add host `/mnt/user/appdata/lgb-planner/data` → container `/data`, Apply. |
| Two browsers overwrite each other | Last write wins. Use **Save as** names if you need separate circuits. |
| Works in Node-RED, not here | Saved Settings still have port `9001` — set **1883**, Save & connect |
| Status cycles connected / disconnected | Old image (browser WS to 1883). Publish a new image and **Update** the container |
| HTTPS reverse proxy, MQTT fails | Page is HTTPS so the planner WS is `wss` to the **same** proxy host, not to Mosquitto |
| Docker tab missing icon / syslog spam about a missing image | Empty **Icon URL**. Unraid then tries Docker Hub for the short name. Edit the container (Advanced View), set Icon URL to `https://raw.githubusercontent.com/simster-lab/lgb-planner/main/docs/unraid-icon.png`, Apply. No new image. The git repo must be **public** for that URL to work. |

The planner container talks to Mosquitto over TCP (like Node-RED). If MQTT Explorer or Node-RED can use `192.168.0.2:1883`, this app can too after Settings use that host and port **and** this image includes the TCP bridge.
