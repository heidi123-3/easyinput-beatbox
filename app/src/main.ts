import { createIcons, Pause, Play, PlugZap, Unplug } from "lucide";
import "./styles.css";
import { BeatboxLink } from "./link";

const link = new BeatboxLink();
const root = document.querySelector<HTMLDivElement>("#app")!;

root.innerHTML = `
  <header class="top">
    <div class="identity">
      <span class="eyebrow">EASYINPUT / PERFORMANCE TOOL</span>
      <h1 class="brand">Beatbox</h1>
    </div>
    <div class="top-actions">
      <div class="connection-state">
        <span class="dot" id="connDot"></span>
        <span id="connLabel">初始化…</span>
      </div>
      <button class="connect-button" id="btnConnect" type="button">
        <i data-lucide="plug-zap"></i>
        <span>连接设备</span>
      </button>
    </div>
  </header>

  <main class="workspace">
    <section class="panel metro">
      <div class="panel-head">
        <div>
          <span class="section-index">01</span>
          <h2>Metronome</h2>
        </div>
      </div>

      <div class="transport-row">
        <div class="bpm-lockup">
          <div class="bpm" id="bpm">120</div>
          <div class="bpm-unit">BPM</div>
        </div>
        <button class="transport-button" id="btnTransport" type="button" disabled
                aria-label="播放" title="播放">
          <i data-lucide="play"></i>
        </button>
      </div>

      <div class="tempo-control">
        <div class="tempo-labels">
          <span>Tempo</span>
          <span id="tempoValue">120 BPM</span>
        </div>
        <div class="slider-row">
          <span>60</span>
          <input id="tempoSlider" type="range" min="60" max="240" step="1" value="120"
                 aria-label="调整 BPM" disabled />
          <span>240</span>
        </div>
      </div>

      <div class="beat-section">
        <div class="beat-header">
          <span>Measure</span>
          <span id="beatLabel">— / 4</span>
        </div>
        <div class="beat-slices" id="beats" aria-label="四拍节拍指示器">
          <span class="beat-slice accent" data-beat="0"></span>
          <span class="beat-slice" data-beat="1"></span>
          <span class="beat-slice" data-beat="2"></span>
          <span class="beat-slice" data-beat="3"></span>
        </div>
      </div>

      <div class="error" id="err" hidden></div>
    </section>

    <section class="panel drum">
      <div class="panel-head">
        <div>
          <span class="section-index">02</span>
          <h2>Drum Machine</h2>
        </div>
        <span class="coming-soon">P2 / RESERVED</span>
      </div>

      <p class="note">为后续鼓机保留的演奏区域。板端 Live Pad 将沿用 GM Channel 10 与当前运输状态。</p>
      <div class="drum-grid">
        <div class="pad"><span>01</span>KICK</div>
        <div class="pad"><span>02</span>SNARE</div>
        <div class="pad"><span>03</span>CHH</div>
        <div class="pad"><span>04</span>OHH</div>
        <div class="pad"><span>05</span>CLAP</div>
        <div class="pad"><span>06</span>TOM</div>
        <div class="pad"><span>07</span>A / B</div>
        <div class="pad"><span>08</span>PLAY</div>
      </div>
      <div class="mapping-note">
        <span>GM MAP</span>
        <span>36 / 38 / 42 / 46 / 39</span>
      </div>
    </section>
  </main>
`;

createIcons({ icons: { Pause, Play, PlugZap, Unplug } });

const els = {
  connDot: root.querySelector<HTMLElement>("#connDot")!,
  connLabel: root.querySelector<HTMLElement>("#connLabel")!,
  bpm: root.querySelector<HTMLElement>("#bpm")!,
  tempoValue: root.querySelector<HTMLElement>("#tempoValue")!,
  tempoSlider: root.querySelector<HTMLInputElement>("#tempoSlider")!,
  beatLabel: root.querySelector<HTMLElement>("#beatLabel")!,
  beats: [...root.querySelectorAll<HTMLElement>(".beat-slice")],
  btnTransport: root.querySelector<HTMLButtonElement>("#btnTransport")!,
  btnConnect: root.querySelector<HTMLButtonElement>("#btnConnect")!,
  err: root.querySelector<HTMLElement>("#err")!,
};

let lastBeatIndex = -1;
let sliderDragging = false;
let pendingSliderBpm: number | null = null;
let sliderFrame = 0;

function updateTransportIcon(running: boolean) {
  const iconName = running ? "pause" : "play";
  const label = running ? "暂停" : "播放";
  if (els.btnTransport.dataset.icon === iconName) return;
  els.btnTransport.dataset.icon = iconName;
  els.btnTransport.innerHTML = `<i data-lucide="${iconName}"></i>`;
  els.btnTransport.ariaLabel = label;
  els.btnTransport.title = label;
  createIcons({ icons: { Pause, Play } });
}

function updateConnectionButton(connected: boolean) {
  const iconName = connected ? "unplug" : "plug-zap";
  const label = connected ? "断开设备" : "连接设备";
  if (els.btnConnect.dataset.icon === iconName) return;
  els.btnConnect.dataset.icon = iconName;
  els.btnConnect.innerHTML = `<i data-lucide="${iconName}"></i><span>${label}</span>`;
  els.btnConnect.ariaLabel = label;
  els.btnConnect.title = label;
  createIcons({ icons: { PlugZap, Unplug } });
}

function render() {
  const s = link.getState();
  els.connDot.classList.toggle("on", s.connected);
  els.connLabel.textContent = s.deviceName;
  els.bpm.textContent = String(s.bpm);
  els.tempoValue.textContent = `${s.bpm} BPM`;
  if (!sliderDragging) els.tempoSlider.value = String(s.bpm);
  els.tempoSlider.style.setProperty("--value", `${((s.bpm - 60) / 180) * 100}%`);

  els.beatLabel.textContent = s.running ? `${s.beatInBar + 1} / 4` : "— / 4";

  for (const el of els.beats) {
    const active = s.running && Number(el.dataset.beat) === s.beatInBar;
    el.classList.toggle("active", active);
  }

  updateTransportIcon(s.running);
  updateConnectionButton(s.connected);
  els.btnTransport.disabled = !s.connected;
  els.tempoSlider.disabled = !s.connected;
}

function queueSliderBpm(bpm: number) {
  pendingSliderBpm = bpm;
  els.bpm.textContent = String(bpm);
  els.tempoValue.textContent = `${bpm} BPM`;
  els.tempoSlider.style.setProperty("--value", `${((bpm - 60) / 180) * 100}%`);
  if (sliderFrame) return;
  sliderFrame = requestAnimationFrame(() => {
    sliderFrame = 0;
    if (pendingSliderBpm != null) {
      link.sendBpm(pendingSliderBpm);
      pendingSliderBpm = null;
    }
  });
}

link.subscribe((s) => {
  if (s.running && s.beatInBar !== lastBeatIndex) {
    lastBeatIndex = s.beatInBar;
    const active = els.beats[s.beatInBar];
    active.classList.remove("strike");
    void active.offsetWidth;
    active.classList.add("strike");
  }
  if (!s.running) lastBeatIndex = -1;
  render();
});

els.btnTransport.addEventListener("click", () => {
  const s = link.getState();
  if (s.running) link.sendStop();
  else link.sendStart();
});

els.tempoSlider.addEventListener("pointerdown", () => {
  sliderDragging = true;
});
els.tempoSlider.addEventListener("input", () => {
  queueSliderBpm(Number(els.tempoSlider.value));
});
const finishSlider = () => {
  sliderDragging = false;
  queueSliderBpm(Number(els.tempoSlider.value));
};
els.tempoSlider.addEventListener("change", finishSlider);
els.tempoSlider.addEventListener("pointerup", finishSlider);

els.btnConnect.addEventListener("click", () => {
  const action = link.getState().connected ? link.disconnect() : link.requestPort();
  action
    .then(() => {
      els.err.hidden = true;
    })
    .catch((e: Error) => {
      if (e.name === "NotFoundError") return;
      els.err.hidden = false;
      els.err.textContent = e.message;
    });
});

window.addEventListener("keydown", (ev) => {
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
  if (ev.code === "Space") {
    ev.preventDefault();
    const s = link.getState();
    if (!s.connected) return;
    if (s.running) link.sendStop();
    else link.sendStart();
  } else if (ev.key === "ArrowLeft") {
    link.sendBpm(link.getState().bpm - 1);
  } else if (ev.key === "ArrowRight") {
    link.sendBpm(link.getState().bpm + 1);
  }
});

link
  .connect()
  .then(() => {
    els.err.hidden = true;
  })
  .catch((e: Error) => {
    els.err.hidden = false;
    els.err.textContent = e.message;
  });
