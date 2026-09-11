import type { BrokerConfig, MqttConnectionStatus } from "../model/types";

export type StatusHandler = (status: MqttConnectionStatus, message?: string) => void;
export type MessageHandler = (topic: string, payload: string) => void;

type BridgeHello = {
  type: "status";
  connected: boolean;
  error?: string;
};

type BridgeIncoming =
  | BridgeHello
  | { type: "message"; topic: string; payload: string };

function bridgeUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/mqtt`;
}

async function applyUpstreamBroker(config: BrokerConfig): Promise<void> {
  const response = await fetch("/api/broker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      tls: config.tls,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Broker update failed (${response.status})`);
  }
}

class MqttService {
  private socket: WebSocket | null = null;
  private statusHandler: StatusHandler | null = null;
  private messageHandler: MessageHandler | null = null;
  private subscriptions = new Set<string>();
  private tcpConnected = false;
  private closing = false;
  private lastConfig: BrokerConfig | null = null;
  private reconnectTimer: number | null = null;

  onStatus(handler: StatusHandler): void {
    this.statusHandler = handler;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.tcpConnected;
  }

  connect(config: BrokerConfig): void {
    this.closing = false;
    this.lastConfig = config;
    void this.connectAsync(config);
  }

  private async connectAsync(config: BrokerConfig): Promise<void> {
    this.dropSocket();
    this.tcpConnected = false;
    this.statusHandler?.("connecting");
    try {
      await applyUpstreamBroker(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reach MQTT bridge";
      this.statusHandler?.("error", message);
      this.scheduleReconnect();
      return;
    }

    const socket = new WebSocket(bridgeUrl());
    this.socket = socket;

    socket.onopen = () => {
      this.pushSubscriptions();
    };
    socket.onmessage = (event) => {
      let msg: BridgeIncoming;
      try {
        msg = JSON.parse(String(event.data)) as BridgeIncoming;
      } catch {
        return;
      }
      if (msg.type === "status") {
        this.tcpConnected = Boolean(msg.connected);
        if (msg.connected) this.statusHandler?.("connected");
        else if (msg.error) this.statusHandler?.("error", msg.error);
        else this.statusHandler?.("connecting");
        return;
      }
      if (msg.type === "message") {
        this.messageHandler?.(msg.topic, msg.payload);
      }
    };
    socket.onerror = () => {
      this.statusHandler?.("error", "WebSocket error");
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.tcpConnected = false;
      if (this.closing) {
        this.statusHandler?.("disconnected");
        return;
      }
      this.statusHandler?.("connecting");
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closing || !this.lastConfig || this.reconnectTimer != null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closing && this.lastConfig) void this.connectAsync(this.lastConfig);
    }, 2000);
  }

  private dropSocket(): void {
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }

  disconnect(): void {
    this.closing = true;
    this.lastConfig = null;
    this.tcpConnected = false;
    this.dropSocket();
    this.statusHandler?.("disconnected");
  }

  publish(topic: string, payload: string): boolean {
    const next = topic.trim();
    if (!next || this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: "publish", topic: next, payload: payload ?? "" }));
    return true;
  }

  resubscribe(topics: string[]): void {
    this.subscriptions = new Set(topics.map((topic) => topic.trim()).filter(Boolean));
    this.pushSubscriptions();
  }

  private pushSubscriptions(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: "subscribe", topics: [...this.subscriptions] }));
  }
}

export const mqttService = new MqttService();
