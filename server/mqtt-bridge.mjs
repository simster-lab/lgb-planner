import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mqtt from "mqtt";
import { WebSocketServer } from "ws";
import {
  DATA_DIR,
  deleteNamed,
  ensureDataDir,
  isLayoutDocument,
  listNamed,
  readCurrent,
  readMeta,
  readNamed,
  sanitizeCircuitName,
  writeCurrent,
  writeNamed,
} from "./layout-store.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
// Unraid often sets PORT to 1883 (MQTT). Never use that for the web UI.
const LISTEN_PORT = 8080;
const STATIC_DIR = process.env.STATIC_DIR || join(ROOT, "..", "dist");

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function envBroker() {
  const tlsRaw = (process.env.MQTT_TLS || "false").toLowerCase();
  return {
    host: process.env.MQTT_HOST || "localhost",
    port: Number(process.env.MQTT_PORT) || 1883,
    username: process.env.MQTT_USER || "",
    password: process.env.MQTT_PASSWORD || "",
    tls: tlsRaw === "true" || tlsRaw === "1" || tlsRaw === "yes",
  };
}

/** @type {{ host: string, port: number, username: string, password: string, tls: boolean }} */
let brokerConfig = envBroker();
/** @type {import("mqtt").MqttClient | null} */
let upstream = null;
/** @type {Set<import("ws").WebSocket>} */
const sockets = new Set();
/** @type {WeakMap<import("ws").WebSocket, string[]>} */
const socketSubs = new WeakMap();
/** @type {Set<string>} */
let subscribed = new Set();

function envUrl() {
  const protocol = brokerConfig.tls ? "mqtts" : "mqtt";
  return `${protocol}://${brokerConfig.host}:${brokerConfig.port}`;
}

function tcpConnected() {
  return Boolean(upstream?.connected);
}

function sendJsonWs(socket, body) {
  if (socket.readyState !== 1) return;
  socket.send(JSON.stringify(body));
}

function broadcastStatus(error) {
  const body = {
    type: "status",
    connected: tcpConnected(),
    host: brokerConfig.host,
    port: brokerConfig.port,
    ...(error ? { error } : {}),
  };
  for (const socket of sockets) sendJsonWs(socket, body);
}

function syncSubscriptions() {
  if (!upstream?.connected) return;
  const wanted = new Set();
  for (const socket of sockets) {
    for (const topic of socketSubs.get(socket) || []) {
      if (topic) wanted.add(topic);
    }
  }
  for (const topic of subscribed) {
    if (!wanted.has(topic)) upstream.unsubscribe(topic);
  }
  for (const topic of wanted) {
    if (!subscribed.has(topic)) {
      upstream.subscribe(topic, { qos: 0 }, (error) => {
        if (error) console.error("MQTT subscribe failed", topic, error.message);
      });
    }
  }
  subscribed = wanted;
}

function publishUpstream(topic, payload) {
  const body = payload == null ? "" : String(payload);
  if (!upstream) {
    console.warn("MQTT drop (no TCP client)", topic);
    return;
  }
  if (!upstream.connected) {
    console.warn("MQTT queued (TCP not up yet)", topic);
  }
  upstream.publish(topic, body, { qos: 0, retain: false }, (error) => {
    if (error) {
      console.error("MQTT publish failed", topic, error.message);
      return;
    }
    const shown = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    console.log(`MQTT out ${topic} ${JSON.stringify(shown)}`);
  });
}

function connectUpstream(next) {
  brokerConfig = {
    host: String(next.host || "localhost").trim() || "localhost",
    port: Number(next.port) || 1883,
    username: typeof next.username === "string" ? next.username : "",
    password: typeof next.password === "string" ? next.password : "",
    tls: Boolean(next.tls),
  };
  if (upstream) {
    upstream.removeAllListeners();
    upstream.end(true);
    upstream = null;
  }
  subscribed = new Set();
  const url = envUrl();
  if (brokerConfig.host === "localhost" || brokerConfig.host === "127.0.0.1") {
    console.warn(
      "MQTT_HOST is localhost — the broker is not in this container. Set MQTT_HOST to the LAN IP (e.g. 192.168.0.2).",
    );
  }
  const client = mqtt.connect(url, {
    clientId: `lgb-${Math.random().toString(36).slice(2, 10)}`,
    username: brokerConfig.username || undefined,
    password: brokerConfig.password || undefined,
    reconnectPeriod: 2000,
    connectTimeout: 8000,
    clean: true,
    protocolVersion: 4,
    queueQoSZero: true,
  });
  upstream = client;
  client.on("connect", () => {
    console.log(`MQTT TCP connected ${url}`);
    syncSubscriptions();
    broadcastStatus();
  });
  client.on("reconnect", () => {
    console.log(`MQTT TCP reconnecting ${url}`);
    broadcastStatus();
  });
  client.on("close", () => {
    console.log("MQTT TCP closed");
    broadcastStatus();
  });
  client.on("offline", () => broadcastStatus());
  client.on("error", (error) => {
    console.error("MQTT TCP error", error.message);
    broadcastStatus(error.message);
  });
  client.on("message", (topic, payload) => {
    if (topic.startsWith("$SYS")) return;
    const message = JSON.stringify({
      type: "message",
      topic,
      payload: payload.toString(),
    });
    for (const socket of sockets) {
      if (socket.readyState === 1) socket.send(message);
    }
  });
  broadcastStatus();
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(data);
}

function readBody(req, maxSize = 32_768) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function layoutFromBody(raw) {
  const data = JSON.parse(raw || "{}");
  if (isLayoutDocument(data)) return { layout: data, name: undefined };
  if (isLayoutDocument(data.layout)) {
    return { layout: data.layout, name: data.name };
  }
  throw new Error("not a layout");
}

async function handleLayoutApi(req, res, path) {
  if (!(path === "/api/layout" || path.startsWith("/api/layouts"))) return false;

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return true;
  }

  try {
    if (path === "/api/layout" && req.method === "GET") {
      const layout = readCurrent();
      if (!layout) {
        sendJson(res, 404, { error: "no current layout" });
        return true;
      }
      sendJson(res, 200, { layout, name: readMeta().name });
      return true;
    }

    if (path === "/api/layout" && req.method === "PUT") {
      const { layout, name } = layoutFromBody(await readBody(req, 2_000_000));
      writeCurrent(layout, name);
      sendJson(res, 200, { ok: true, name: readMeta().name });
      return true;
    }

    if (path === "/api/layouts" && req.method === "GET") {
      sendJson(res, 200, { names: listNamed() });
      return true;
    }

    if (path === "/api/layouts/import" && req.method === "POST") {
      const parsed = layoutFromBody(await readBody(req, 2_000_000));
      const name = sanitizeCircuitName(parsed.name);
      if (!name) {
        sendJson(res, 400, { ok: false, error: "invalid name" });
        return true;
      }
      writeNamed(name, parsed.layout);
      sendJson(res, 200, { ok: true, name, layout: parsed.layout });
      return true;
    }

    if (path.startsWith("/api/layouts/")) {
      const name = sanitizeCircuitName(decodeURIComponent(path.slice("/api/layouts/".length)));
      if (!name) {
        sendJson(res, 400, { ok: false, error: "invalid name" });
        return true;
      }
      if (req.method === "GET") {
        const layout = readNamed(name);
        if (!layout) {
          sendJson(res, 404, { error: "not found" });
          return true;
        }
        sendJson(res, 200, { layout, name });
        return true;
      }
      if (req.method === "PUT") {
        const { layout } = layoutFromBody(await readBody(req, 2_000_000));
        writeNamed(name, layout);
        sendJson(res, 200, { ok: true, name });
        return true;
      }
      if (req.method === "DELETE") {
        if (!deleteNamed(name)) {
          sendJson(res, 404, { error: "not found" });
          return true;
        }
        sendJson(res, 200, { ok: true, name });
        return true;
      }
    }
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : "bad request" });
    return true;
  }

  return false;
}

function safeStaticPath(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0] || "/");
  const relative = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const resolved = normalize(join(STATIC_DIR, relative));
  if (!resolved.startsWith(normalize(STATIC_DIR))) return undefined;
  return resolved;
}

function serveStatic(req, res) {
  const filePath = safeStaticPath(req.url || "/");
  if (!filePath) {
    res.writeHead(403);
    res.end();
    return;
  }
  let target = filePath;
  if (!existsSync(target) || !statSync(target).isFile()) {
    const index = join(STATIC_DIR, "index.html");
    if (!existsSync(index)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    target = index;
  }
  const type = MIME[extname(target)] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": target.endsWith("index.html") || target.endsWith("config.json") ? "no-store" : "public, max-age=31536000",
  });
  createReadStream(target).pipe(res);
}

const httpServer = createServer(async (req, res) => {
  const url = req.url || "/";
  const path = url.split("?")[0];

  if (await handleLayoutApi(req, res, path)) return;

  if (req.method === "OPTIONS" && (path === "/api/broker" || path.startsWith("/api/"))) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (path === "/api/broker" && req.method === "GET") {
    sendJson(res, 200, {
      host: brokerConfig.host,
      port: brokerConfig.port,
      tls: brokerConfig.tls,
      connected: tcpConnected(),
    });
    return;
  }

  if (path === "/api/broker" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const data = JSON.parse(raw || "{}");
      connectUpstream(data);
      sendJson(res, 200, { ok: true, host: brokerConfig.host, port: brokerConfig.port });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : "bad request" });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }

  serveStatic(req, res);
});

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (socket) => {
  sockets.add(socket);
  socketSubs.set(socket, []);
  sendJsonWs(socket, {
    type: "status",
    connected: tcpConnected(),
    host: brokerConfig.host,
    port: brokerConfig.port,
  });
  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg?.type === "publish" && typeof msg.topic === "string") {
      publishUpstream(msg.topic.trim(), msg.payload);
    }
    if (msg?.type === "subscribe" && Array.isArray(msg.topics)) {
      socketSubs.set(
        socket,
        msg.topics.map((topic) => String(topic || "").trim()).filter(Boolean),
      );
      syncSubscriptions();
    }
  });
  socket.on("close", () => {
    sockets.delete(socket);
    syncSubscriptions();
  });
  socket.on("error", (error) => {
    console.error("MQTT WS error", error.message);
  });
});

httpServer.on("upgrade", (req, socket, head) => {
  const path = (req.url || "/").split("?")[0];
  if (path !== "/mqtt") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

setInterval(() => {
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.ping();
  }
}, 25_000);

ensureDataDir();
connectUpstream(brokerConfig);

httpServer.listen(LISTEN_PORT, "0.0.0.0", () => {
  console.log(`LGB planner listening on 0.0.0.0:${LISTEN_PORT} (static ${STATIC_DIR})`);
  console.log(`Layouts ${DATA_DIR}`);
  console.log(`MQTT TCP upstream ${envUrl()}`);
});
httpServer.on("error", (error) => {
  console.error("HTTP server error", error);
  process.exit(1);
});
