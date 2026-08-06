export type BeatboxState = {
  connected: boolean;
  deviceName: string;
  link: "none" | "serial" | "midi";
  bpm: number;
  running: boolean;
  beatInBar: number; // 0-3
  accent: boolean;
  updatedAt: number;
};

type Listener = (state: BeatboxState) => void;

const ESPRESSIF_VID = 0x303a;
const MATCH = /beatbox|easyinput/i;

type HostMsg =
  | { t: "hello"; v?: number; name?: string }
  | { t: "state"; bpm: number; run: number; beat: number }
  | { t: "beat"; accent: number; beat: number }
  | { t: "start" }
  | { t: "stop" };

export class BeatboxLink {
  private listeners = new Set<Listener>();
  private state: BeatboxState = {
    connected: false,
    deviceName: "未连接",
    link: "none",
    bpm: 120,
    running: false,
    beatInBar: 0,
    accent: false,
    updatedAt: Date.now(),
  };

  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoopActive = false;
  private rxText = "";
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private reconnectTimer: number | null = null;
  private userDisconnected = false;
  private closing = false;

  getState() {
    return this.state;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.state = { ...this.state, updatedAt: Date.now() };
    for (const fn of this.listeners) fn(this.state);
  }

  private setDisconnected(label = "等待 EasyInput Beatbox…") {
    this.state = {
      ...this.state,
      connected: false,
      deviceName: label,
      link: "none",
      running: false,
    };
    this.emit();
  }

  async connect() {
    if (!("serial" in navigator)) {
      throw new Error("当前浏览器不支持 Web Serial。请使用 Chrome / Edge，并允许串口权限。");
    }
    this.scheduleAutoReconnect();
    await this.tryExistingPorts();
  }

  async requestPort() {
    if (!("serial" in navigator)) {
      throw new Error("当前浏览器不支持 Web Serial。");
    }
    this.userDisconnected = false;
    const port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: ESPRESSIF_VID }],
    });
    await this.openPort(port);
  }

  async disconnect() {
    this.userDisconnected = true;
    await this.closePort();
    this.setDisconnected("未连接");
  }

  private scheduleAutoReconnect() {
    if (this.reconnectTimer != null) return;
    this.reconnectTimer = window.setInterval(() => {
      if (!this.state.connected && !this.userDisconnected) {
        void this.tryExistingPorts();
      }
    }, 1500);
  }

  private async tryExistingPorts() {
    if (this.userDisconnected || this.state.connected || this.readLoopActive) return;
    const ports = await navigator.serial.getPorts();
    for (const port of ports) {
      const info = port.getInfo();
      if (info.usbVendorId != null && info.usbVendorId !== ESPRESSIF_VID) continue;
      try {
        await this.openPort(port);
        return;
      } catch {
        /* try next */
      }
    }
    if (!this.state.connected) {
      this.setDisconnected("等待设备…点击「连接」授权串口");
    }
  }

  private async openPort(port: SerialPort) {
    if (this.port === port && this.state.connected) return;

    await this.closePort();
    this.port = port;

    await port.open({ baudRate: 115200 });
    this.writer = port.writable?.getWriter() ?? null;
    this.reader = port.readable?.getReader() ?? null;
    this.readLoopActive = true;
    this.rxText = "";

    this.state = {
      ...this.state,
      connected: true,
      deviceName: "EasyInput Beatbox",
      link: "serial",
    };
    this.emit();

    void this.writeLine('{"t":"ping"}');
    void this.readLoop();
  }

  private async closePort() {
    if (this.closing) return;
    this.closing = true;
    this.readLoopActive = false;
    const reader = this.reader;
    const writer = this.writer;
    const port = this.port;
    this.reader = null;
    this.writer = null;
    this.port = null;
    try {
      await reader?.cancel();
    } catch {
      /* ignore */
    }
    try {
      reader?.releaseLock();
    } catch {
      /* ignore */
    }
    try {
      writer?.releaseLock();
    } catch {
      /* ignore */
    }
    try {
      await port?.close();
    } catch {
      /* ignore */
    }
    this.closing = false;
  }

  private async readLoop() {
    const reader = this.reader;
    if (!reader) return;
    try {
      while (this.readLoopActive) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        this.rxText += this.decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = this.rxText.indexOf("\n")) >= 0) {
          const line = this.rxText.slice(0, nl).trim();
          this.rxText = this.rxText.slice(nl + 1);
          if (line) this.onLine(line);
        }
      }
    } catch {
      /* disconnect */
    } finally {
      this.readLoopActive = false;
      this.setDisconnected(this.userDisconnected ? "未连接" : "已断开，正在重连…");
      void this.closePort();
    }
  }

  private onLine(line: string) {
    if (!line.startsWith("{")) return;
    let msg: HostMsg;
    try {
      msg = JSON.parse(line) as HostMsg;
    } catch {
      return;
    }

    switch (msg.t) {
      case "hello":
        this.state = {
          ...this.state,
          connected: true,
          link: "serial",
          deviceName: msg.name && MATCH.test(msg.name) ? msg.name : "EasyInput Beatbox",
        };
        this.emit();
        break;
      case "state":
        this.state.bpm = Math.max(40, Math.min(300, Math.round(msg.bpm)));
        this.state.running = !!msg.run;
        this.state.beatInBar = msg.beat & 0x03;
        this.state.accent = this.state.beatInBar === 0;
        this.emit();
        break;
      case "beat":
        this.state.beatInBar = msg.beat & 0x03;
        this.state.accent = !!msg.accent;
        this.state.running = true;
        this.emit();
        break;
      case "start":
        this.state.running = true;
        this.emit();
        break;
      case "stop":
        this.state.running = false;
        this.emit();
        break;
      default:
        break;
    }
  }

  private async writeLine(line: string) {
    if (!this.writer) return;
    try {
      await this.writer.write(this.encoder.encode(line + "\n"));
    } catch {
      this.setDisconnected("写入失败，正在重连…");
      void this.closePort();
    }
  }

  sendStart() {
    void this.writeLine('{"t":"start"}');
  }

  sendStop() {
    void this.writeLine('{"t":"stop"}');
  }

  sendBpm(bpm: number) {
    const v = Math.max(60, Math.min(240, Math.round(bpm)));
    this.state.bpm = v;
    this.emit();
    void this.writeLine(`{"t":"bpm","v":${v}}`);
  }
}
