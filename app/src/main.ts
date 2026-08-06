import { createIcons, Pause, Play, PlugZap, Unplug } from "lucide";
import "./styles.css";
import { BeatboxLink } from "./link";
import {
  clearPattern,
  clearTrack,
  copyPattern,
  toggleStep,
  type PatternBanks,
} from "./pattern";
import { TRACK_LABELS, TRACK_NOTES } from "./protocol";

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

      <div class="mode-select seg" role="group" aria-label="播放模式">
        <button type="button" class="seg-btn active" id="btnModeMetro">仅节拍器</button>
        <button type="button" class="seg-btn" id="btnModeDrum">鼓机</button>
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

      <div class="tempo-control">
        <div class="tempo-labels">
          <span>节奏摇摆</span>
          <span id="swingValue">均匀</span>
        </div>
        <div class="slider-row">
          <span>均匀</span>
          <input id="swingSlider" type="range" min="50" max="75" step="1" value="50"
                 aria-label="节奏摇摆：提高后反拍更靠后" disabled />
          <span>强摆</span>
        </div>
        <p class="field-hint">把反拍（第 2、4、6… 个十六分）往后推一点，groove 更“甩”。</p>
      </div>

      <div class="tempo-control">
        <div class="tempo-labels">
          <span>总音量</span>
          <span id="volumeValue">100</span>
        </div>
        <div class="slider-row">
          <span>静音</span>
          <input id="volumeSlider" type="range" min="0" max="127" step="1" value="100"
                 aria-label="总音量" disabled />
          <span>最大</span>
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
        <div class="drum-badges">
          <span class="badge" id="syncBadge">OFFLINE</span>
        </div>
      </div>

      <div class="drum-toolbar">
        <div class="seg" role="group" aria-label="Pattern bank">
          <button type="button" class="seg-btn active" data-bank-ui="a" id="btnBankA">A</button>
          <button type="button" class="seg-btn" data-bank-ui="b" id="btnBankB">B</button>
          <button type="button" class="seg-btn" data-bank-ui="fill" id="btnBankFill">加花</button>
        </div>
        <div class="toolbar-actions">
          <button type="button" class="ghost-btn" id="btnFill" disabled>按住加花</button>
          <button type="button" class="ghost-btn" id="btnSave" disabled>保存</button>
        </div>
      </div>

      <label class="check-row drum-click-row" id="clickRow">
        <input id="clickEnable" type="checkbox" checked disabled />
        <span id="clickLabel">在鼓点上叠加节拍器声</span>
      </label>

      <p class="field-hint pads-hint">鼓垫：点击试听；下方格子编排节奏，改完会自动发到板子。</p>
      <div class="pads-row" id="pads"></div>

      <div class="seq-wrap">
        <div class="seq-head">
          <span class="seq-label"></span>
          <div class="seq-steps-head" id="stepHeads"></div>
        </div>
        <div class="seq-grid" id="seqGrid"></div>
      </div>

      <div class="seq-footer">
        <button type="button" class="ghost-btn" id="btnClearTrack" disabled>清空当前轨</button>
        <button type="button" class="ghost-btn" id="btnClearPattern" disabled>清空 Pattern</button>
        <button type="button" class="ghost-btn" id="btnCopyAB" disabled>A → B</button>
        <span class="mapping-note-inline">GM 36 / 38 / 42 / 46 / 39 / 37 · S6 Fill · S7 A/B</span>
      </div>
    </section>
  </main>
`;

createIcons({ icons: { Pause, Play, PlugZap, Unplug } });

const padsEl = root.querySelector<HTMLDivElement>("#pads")!;
for (let i = 0; i < TRACK_LABELS.length; i++) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pad";
  btn.dataset.pad = String(i);
  btn.innerHTML = `<span>0${i + 1}</span>${TRACK_LABELS[i]}`;
  btn.disabled = true;
  padsEl.appendChild(btn);
}

const stepHeads = root.querySelector<HTMLDivElement>("#stepHeads")!;
for (let s = 0; s < 16; s++) {
  const el = document.createElement("span");
  el.className = "step-head" + (s % 4 === 0 ? " beat-mark" : "");
  el.textContent = String(s + 1);
  el.dataset.step = String(s);
  stepHeads.appendChild(el);
}

const seqGrid = root.querySelector<HTMLDivElement>("#seqGrid")!;
const stepButtons: HTMLButtonElement[][] = [];
for (let t = 0; t < TRACK_LABELS.length; t++) {
  const row = document.createElement("div");
  row.className = "seq-row";
  const label = document.createElement("button");
  label.type = "button";
  label.className = "seq-label track-select";
  label.dataset.track = String(t);
  label.textContent = TRACK_LABELS[t];
  row.appendChild(label);

  const steps = document.createElement("div");
  steps.className = "seq-steps";
  const rowBtns: HTMLButtonElement[] = [];
  for (let s = 0; s < 16; s++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "step-cell" + (s % 4 === 0 ? " beat-mark" : "");
    cell.dataset.track = String(t);
    cell.dataset.step = String(s);
    cell.disabled = true;
    steps.appendChild(cell);
    rowBtns.push(cell);
  }
  row.appendChild(steps);
  seqGrid.appendChild(row);
  stepButtons.push(rowBtns);
}

const els = {
  connDot: root.querySelector<HTMLElement>("#connDot")!,
  connLabel: root.querySelector<HTMLElement>("#connLabel")!,
  bpm: root.querySelector<HTMLElement>("#bpm")!,
  tempoValue: root.querySelector<HTMLElement>("#tempoValue")!,
  tempoSlider: root.querySelector<HTMLInputElement>("#tempoSlider")!,
  swingValue: root.querySelector<HTMLElement>("#swingValue")!,
  swingSlider: root.querySelector<HTMLInputElement>("#swingSlider")!,
  volumeValue: root.querySelector<HTMLElement>("#volumeValue")!,
  volumeSlider: root.querySelector<HTMLInputElement>("#volumeSlider")!,
  beatLabel: root.querySelector<HTMLElement>("#beatLabel")!,
  beats: [...root.querySelectorAll<HTMLElement>(".beat-slice")],
  btnTransport: root.querySelector<HTMLButtonElement>("#btnTransport")!,
  btnConnect: root.querySelector<HTMLButtonElement>("#btnConnect")!,
  btnModeMetro: root.querySelector<HTMLButtonElement>("#btnModeMetro")!,
  btnModeDrum: root.querySelector<HTMLButtonElement>("#btnModeDrum")!,
  clickRow: root.querySelector<HTMLLabelElement>("#clickRow")!,
  clickEnable: root.querySelector<HTMLInputElement>("#clickEnable")!,
  clickLabel: root.querySelector<HTMLElement>("#clickLabel")!,
  err: root.querySelector<HTMLElement>("#err")!,
  syncBadge: root.querySelector<HTMLElement>("#syncBadge")!,
  btnBankA: root.querySelector<HTMLButtonElement>("#btnBankA")!,
  btnBankB: root.querySelector<HTMLButtonElement>("#btnBankB")!,
  btnBankFill: root.querySelector<HTMLButtonElement>("#btnBankFill")!,
  btnFill: root.querySelector<HTMLButtonElement>("#btnFill")!,
  btnSave: root.querySelector<HTMLButtonElement>("#btnSave")!,
  btnClearTrack: root.querySelector<HTMLButtonElement>("#btnClearTrack")!,
  btnClearPattern: root.querySelector<HTMLButtonElement>("#btnClearPattern")!,
  btnCopyAB: root.querySelector<HTMLButtonElement>("#btnCopyAB")!,
  pads: [...root.querySelectorAll<HTMLButtonElement>(".pad")],
  stepHeads: [...root.querySelectorAll<HTMLElement>(".step-head")],
  trackLabels: [...root.querySelectorAll<HTMLButtonElement>(".track-select")],
};

let lastBeatIndex = -1;
let lastStep = -1;
let sliderDragging = false;
let swingDragging = false;
let volumeDragging = false;
let pendingSliderBpm: number | null = null;
let pendingSliderVolume: number | null = null;
let sliderFrame = 0;
let volumeFrame = 0;
let editBank: 0 | 1 | 2 = 0;
let selectedTrack = 0;
let undoStack: PatternBanks[] = [];

function currentTracks(pattern: PatternBanks) {
  if (editBank === 1) return pattern.b;
  if (editBank === 2) return pattern.fill;
  return pattern.a;
}

function withCurrentTracks(pattern: PatternBanks, tracks: number[][]): PatternBanks {
  if (editBank === 1) return { ...pattern, b: tracks };
  if (editBank === 2) return { ...pattern, fill: tracks };
  return { ...pattern, a: tracks };
}

function pushUndo(pattern: PatternBanks) {
  undoStack.push(structuredClone(pattern));
  if (undoStack.length > 32) undoStack.shift();
}

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

function renderPatternGrid() {
  const s = link.getState();
  const tracks = currentTracks(s.pattern);
  for (let t = 0; t < TRACK_LABELS.length; t++) {
    els.trackLabels[t].classList.toggle("active", t === selectedTrack);
    for (let step = 0; step < 16; step++) {
      const cell = stepButtons[t][step];
      const vel = tracks[t][step];
      cell.classList.toggle("on", vel > 0);
      cell.classList.toggle("playhead", s.running && s.step === step);
      cell.style.setProperty("--vel", String(Math.max(0.35, vel / 127)));
      cell.disabled = !s.connected;
    }
  }
  for (const head of els.stepHeads) {
    head.classList.toggle("playhead", s.running && Number(head.dataset.step) === s.step);
  }
}

function render() {
  const s = link.getState();
  els.connDot.classList.toggle("on", s.connected && s.sync !== "stale");
  els.connDot.classList.toggle("stale", s.sync === "stale");
  const syncText =
    s.sync === "synced"
      ? s.deviceName
      : s.sync === "connecting"
        ? "同步中…"
        : s.sync === "stale"
          ? `${s.deviceName}（延迟）`
          : s.deviceName;
  els.connLabel.textContent = syncText;

  els.bpm.textContent = String(s.bpm);
  els.tempoValue.textContent = `${s.bpm} BPM`;
  if (!sliderDragging) els.tempoSlider.value = String(s.bpm);
  els.tempoSlider.style.setProperty("--value", `${((s.bpm - 60) / 180) * 100}%`);

  els.swingValue.textContent = swingLabel(s.swing);
  if (!swingDragging) els.swingSlider.value = String(s.swing);
  els.swingSlider.style.setProperty("--value", `${((s.swing - 50) / 25) * 100}%`);

  els.volumeValue.textContent = String(s.volume);
  if (!volumeDragging) els.volumeSlider.value = String(s.volume);
  els.volumeSlider.style.setProperty("--value", `${(s.volume / 127) * 100}%`);

  els.beatLabel.textContent = s.running ? `${s.beatInBar + 1} / 4 · step ${s.step + 1}` : "— / 4";

  for (const el of els.beats) {
    const active = s.running && Number(el.dataset.beat) === s.beatInBar;
    el.classList.toggle("active", active);
  }

  updateTransportIcon(s.running);
  updateConnectionButton(s.connected);
  const ready = s.connected && s.sync !== "disconnected";
  els.btnTransport.disabled = !ready;
  els.tempoSlider.disabled = !ready;
  els.swingSlider.disabled = !ready || !s.drumMode;
  els.volumeSlider.disabled = !ready;
  els.clickRow.hidden = !s.drumMode;
  els.clickEnable.disabled = !ready || !s.drumMode;
  if (document.activeElement !== els.clickEnable) {
    els.clickEnable.checked = s.click;
  }
  els.btnFill.disabled = !ready;
  els.btnSave.disabled = !ready;
  els.btnClearTrack.disabled = !ready;
  els.btnClearPattern.disabled = !ready;
  els.btnCopyAB.disabled = !ready;
  for (const pad of els.pads) pad.disabled = !ready;

  els.btnModeMetro.disabled = !ready;
  els.btnModeDrum.disabled = !ready;
  els.btnModeMetro.classList.toggle("active", !s.drumMode);
  els.btnModeDrum.classList.toggle("active", s.drumMode);

  els.syncBadge.textContent =
    s.sync === "synced" ? (s.patternDirty ? "同步中" : "已连接") : s.sync === "connecting" ? "同步中" : s.sync === "stale" ? "延迟" : "未连接";
  els.syncBadge.classList.toggle("warn", s.patternDirty || s.sync === "stale");

  els.btnBankA.classList.toggle("active", editBank === 0);
  els.btnBankB.classList.toggle("active", editBank === 1);
  els.btnBankFill.classList.toggle("active", editBank === 2);
  els.btnFill.classList.toggle("active", s.fill);

  if (s.step !== lastStep) {
    lastStep = s.step;
  }
  renderPatternGrid();
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

function swingLabel(swing: number): string {
  if (swing <= 50) return "均匀";
  if (swing < 60) return `轻微 ${swing}%`;
  if (swing < 68) return `适中 ${swing}%`;
  return `强摆 ${swing}%`;
}

function mutatePattern(mutator: (pattern: PatternBanks) => PatternBanks) {
  const s = link.getState();
  pushUndo(s.pattern);
  link.setLocalPattern(mutator(s.pattern), editBank);
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
  else if (s.bar === 0 && s.step === 0 && s.tick === 0) link.sendStart();
  else link.sendContinue();
});

els.btnModeMetro.addEventListener("click", () => link.sendMode(false));
els.btnModeDrum.addEventListener("click", () => link.sendMode(true));

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

els.swingSlider.addEventListener("pointerdown", () => {
  swingDragging = true;
});
els.swingSlider.addEventListener("input", () => {
  const v = Number(els.swingSlider.value);
  els.swingValue.textContent = swingLabel(v);
  els.swingSlider.style.setProperty("--value", `${((v - 50) / 25) * 100}%`);
  link.sendSwing(v);
});
els.swingSlider.addEventListener("pointerup", () => {
  swingDragging = false;
});

function queueSliderVolume(volume: number) {
  pendingSliderVolume = volume;
  els.volumeValue.textContent = String(volume);
  els.volumeSlider.style.setProperty("--value", `${(volume / 127) * 100}%`);
  if (volumeFrame) return;
  volumeFrame = requestAnimationFrame(() => {
    volumeFrame = 0;
    if (pendingSliderVolume != null) {
      link.sendVolume(pendingSliderVolume);
      pendingSliderVolume = null;
    }
  });
}

els.volumeSlider.addEventListener("pointerdown", () => {
  volumeDragging = true;
});
els.volumeSlider.addEventListener("input", () => {
  queueSliderVolume(Number(els.volumeSlider.value));
});
const finishVolume = () => {
  volumeDragging = false;
  queueSliderVolume(Number(els.volumeSlider.value));
};
els.volumeSlider.addEventListener("change", finishVolume);
els.volumeSlider.addEventListener("pointerup", finishVolume);

els.clickEnable.addEventListener("change", () => {
  link.sendClick(els.clickEnable.checked);
});
els.clickEnable.addEventListener("click", (ev) => {
  /* Ensure the toggle always sends, even if render races the checked state. */
  ev.stopPropagation();
});

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

els.btnBankA.addEventListener("click", () => {
  editBank = 0;
  if (link.getState().connected) link.sendVariation(0);
  render();
});
els.btnBankB.addEventListener("click", () => {
  editBank = 1;
  if (link.getState().connected) link.sendVariation(1);
  render();
});
els.btnBankFill.addEventListener("click", () => {
  editBank = 2;
  render();
});

els.btnFill.addEventListener("pointerdown", (ev) => {
  ev.preventDefault();
  link.sendFill(true);
});
els.btnFill.addEventListener("pointerup", () => link.sendFill(false));
els.btnFill.addEventListener("pointerleave", () => link.sendFill(false));

els.btnSave.addEventListener("click", () => link.sendSave());

els.btnClearTrack.addEventListener("click", () => {
  mutatePattern((p) => withCurrentTracks(p, clearTrack(currentTracks(p), selectedTrack)));
});
els.btnClearPattern.addEventListener("click", () => {
  mutatePattern((p) => withCurrentTracks(p, clearPattern(currentTracks(p))));
});
els.btnCopyAB.addEventListener("click", () => {
  mutatePattern((p) => ({ ...p, b: copyPattern(p.a) }));
  editBank = 1;
});

for (const pad of els.pads) {
  pad.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const idx = Number(pad.dataset.pad);
    if (!link.getState().connected) return;
    pad.classList.add("active");
    link.sendNote(TRACK_NOTES[idx], 127);
  });
  pad.addEventListener("pointerup", () => pad.classList.remove("active"));
  pad.addEventListener("pointerleave", () => pad.classList.remove("active"));
}

for (const label of els.trackLabels) {
  label.addEventListener("click", () => {
    selectedTrack = Number(label.dataset.track);
    render();
  });
}

seqGrid.addEventListener("click", (ev) => {
  const target = ev.target as HTMLElement;
  if (!target.classList.contains("step-cell")) return;
  const track = Number(target.dataset.track);
  const step = Number(target.dataset.step);
  selectedTrack = track;
  mutatePattern((p) => withCurrentTracks(p, toggleStep(currentTracks(p), track, step)));
});

window.addEventListener("keydown", (ev) => {
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
  if (ev.code === "Space") {
    ev.preventDefault();
    const s = link.getState();
    if (!s.connected) return;
    if (s.running) link.sendStop();
    else if (s.bar === 0 && s.step === 0 && s.tick === 0) link.sendStart();
    else link.sendContinue();
  } else if (ev.key === "ArrowLeft") {
    link.sendBpm(link.getState().bpm - 1);
  } else if (ev.key === "ArrowRight") {
    link.sendBpm(link.getState().bpm + 1);
  } else if ((ev.metaKey || ev.ctrlKey) && ev.key === "z") {
    const prev = undoStack.pop();
    if (prev) link.setLocalPattern(prev);
  } else if (ev.key >= "1" && ev.key <= "6") {
    const idx = Number(ev.key) - 1;
    link.sendNote(TRACK_NOTES[idx], 127);
    els.pads[idx]?.classList.add("active");
    window.setTimeout(() => els.pads[idx]?.classList.remove("active"), 80);
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
