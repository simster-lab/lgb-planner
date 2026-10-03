import type { DccexConfig, MqttConnectionStatus } from "../model/types";

export type DccexStatusHandler = (status: MqttConnectionStatus, message?: string) => void;
export type DccexReplyHandler = (reply: string) => void;
export type DccexPowerHandler = (on: boolean) => void;

type BridgeIncoming =
  | { type: "status"; connected: boolean; error?: string }
  | { type: "reply"; reply: string }
  | { type: "power"; on: boolean };

function bridgeUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/dccex`;
}

async function applyUpstream(config: DccexConfig): Promise<void> {
  const response = await fetch("/api/dccex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host: config.host, port: config.port }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `DCC-EX update failed (${response.status})`);
  }
}

class DccexService {
  private socket: WebSocket | null = null;
  private statusHandler: DccexStatusHandler | null = null;
  private replyHandler: DccexReplyHandler | null = null;
  private powerHandler: DccexPowerHandler | null = null;
  private tcpConnected = false;
  private closing = false;
  private lastConfig: DccexConfig | null = null;
  private reconnectTimer: number | null = null;

  onStatus(handler: DccexStatusHandler): void {
    this.statusHandler = handler;
  }

  onReply(handler: DccexReplyHandler): void {
    this.replyHandler = handler;
  }

  onPower(handler: DccexPowerHandler): void {
    this.powerHandler = handler;
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.tcpConnected;
  }

  connect(config: DccexConfig): void {
    this.closing = false;
    this.lastConfig = config;
    void this.connectAsync(config);
  }

  private async connectAsync(config: DccexConfig): Promise<void> {
    this.dropSocket();
    this.tcpConnected = false;
    this.statusHandler?.("connecting");
    if (!config.host.trim()) {
      this.statusHandler?.("error", "Set the DCC-EX host in Settings");
      return;
    }
    try {
      await applyUpstream(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reach DCC-EX bridge";
      this.statusHandler?.("error", message);
      this.scheduleReconnect();
      return;
    }

    const socket = new WebSocket(bridgeUrl());
    this.socket = socket;
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
      if (msg.type === "reply") this.replyHandler?.(msg.reply);
      if (msg.type === "power") this.powerHandler?.(msg.on);
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
    void fetch("/api/dccex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disconnect: true }),
    }).catch(() => undefined);
    this.statusHandler?.("disconnected");
  }

  send(command: string): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: "command", command }));
    return true;
  }
}

export const dccexService = new DccexService();
