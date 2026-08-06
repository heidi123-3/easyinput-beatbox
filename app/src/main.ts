import { createIcons, Eraser, Pause, Play, Trash2, Volume2, VolumeX } from "lucide";
import "./styles.css";
import { DRUM_ICONS, type DrumIconId } from "./drum-icons";
import { BeatboxLink } from "./link";
import {
  clearPattern,
  clearTrack,
  toggleStep,
  type PatternBanks,
} from "./pattern";
import {
  NOTE_CHH,
  NOTE_CLAP,
  NOTE_KICK,
  NOTE_OHH,
  NOTE_RIM,
  NOTE_SNARE,
  TRACK_LABELS,
  TRACK_NOTES,
} from "./protocol";

/**
 * Physical 4×2 matrix (S1–S4 top, S5–S8 bottom).
 * Order follows common finger-drumming / MPC practice:
 * foundation Kick+Snare on the bottom row; hats & perc above.
 */
const HW_PADS: {
  key: number;
  label: string;
  role: "drum" | "abfill" | "play";
  note: number | null;
  icon: DrumIconId;
}[] = [
  { key: 0, label: "CHH", role: "drum", note: NOTE_CHH, icon: "chh" },
  { key: 1, label: "OHH", role: "drum", note: NOTE_OHH, icon: "ohh" },
  { key: 2, label: "CLAP", role: "drum", note: NOTE_CLAP, icon: "clap" },
  { key: 3, label: "RIM", role: "drum", note: NOTE_RIM, icon: "rim" },
  { key: 4, label: "KICK", role: "drum", note: NOTE_KICK, icon: "kick" },
  { key: 5, label: "SNARE", role: "drum", note: NOTE_SNARE, icon: "snare" },
  { key: 6, label: "A/B FILL", role: "abfill", note: null, icon: "abfill" },
  { key: 7, label: "PLAY", role: "play", note: null, icon: "play" },
];

const link = new BeatboxLink();
const root = document.querySelector<HTMLDivElement>("#app")!;

root.innerHTML = `
  <header class="top">
    <div class="identity">
      <span class="eyebrow">EASYINPUT / PERFORMANCE TOOL</span>
      <h1 class="brand">Beatbox</h1>
    </div>
    <div class="top-actions">
      <button class="connect-button" id="btnConnect" type="button" aria-label="连接设备">
        <span class="dot" id="connDot"></span>
        <span id="connLabel">连接设备</span>
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
        <label class="toggle" title="启用节拍器">
          <input id="metroEnable" type="checkbox" checked disabled />
          <span class="toggle-ui" aria-hidden="true">
            <span class="toggle-rail">
              <span class="toggle-knob"></span>
            </span>
            <span class="toggle-text">
              <span class="toggle-label">节拍器</span>
              <span class="toggle-state" id="metroState">开</span>
            </span>
          </span>
        </label>
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

      <div class="beat-section under-bpm">
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
      </div>

      <div class="tempo-control">
        <div class="tempo-labels">
          <span>总音量</span>
          <span id="volumeValue">100</span>
        </div>
        <div class="slider-row volume-row">
          <i data-lucide="volume-x" class="slider-icon" aria-hidden="true"></i>
          <input id="volumeSlider" type="range" min="0" max="127" step="1" value="100"
                 aria-label="总音量" disabled />
          <i data-lucide="volume-2" class="slider-icon" aria-hidden="true"></i>
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
        <label class="toggle" title="启用鼓机">
          <input id="drumEnable" type="checkbox" disabled />
          <span class="toggle-ui" aria-hidden="true">
            <span class="toggle-rail">
              <span class="toggle-knob"></span>
            </span>
            <span class="toggle-text">
              <span class="toggle-label">鼓机</span>
              <span class="toggle-state" id="drumState">关</span>
            </span>
          </span>
        </label>
      </div>

      <div class="drum-toolbar">
        <div class="seg" role="group" aria-label="Pattern bank">
          <button type="button" class="seg-btn active" id="btnBankA"
                  title="切换到 Pattern A">A</button>
          <button type="button" class="seg-btn" id="btnBankB"
                  title="切换到 Pattern B">B</button>
          <button type="button" class="seg-btn" id="btnBankFill"
                  title="编辑加花谱；按住试听">加花</button>
        </div>
        <p class="pattern-status" id="patternStatus">PATTERN A</p>
      </div>

      <div class="pads-matrix" id="pads" aria-label="4×2 实体键位"></div>

      <div class="seq-wrap">
        <div class="seq-head">
          <span class="seq-label"></span>
          <div class="seq-steps-head" id="stepHeads"></div>
        </div>
        <div class="seq-grid" id="seqGrid"></div>
      </div>

      <div class="seq-footer">
        <button type="button" class="ghost-btn" id="btnClearTrack" disabled
                title="清空当前选中轨道">
          <i data-lucide="eraser"></i>
          <span>清空本轨</span>
        </button>
        <button type="button" class="ghost-btn" id="btnClearPattern" disabled
                title="清空当前 Pattern 全部轨道">
          <i data-lucide="trash-2"></i>
          <span>清空全部</span>
        </button>
      </div>
    </section>
  </main>
`;

createIcons({ icons: { Eraser, Pause, Play, Trash2, Volume2, VolumeX } });

const padsEl = root.querySelector<HTMLDivElement>("#pads")!;
for (const pad of HW_PADS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pad" + (pad.role !== "drum" ? " pad-control" : "");
  btn.dataset.pad = String(pad.key);
  btn.dataset.role = pad.role;
  btn.innerHTML = `
    <span class="pad-key">S${pad.key + 1}</span>
    <span class="pad-icon">${DRUM_ICONS[pad.icon]}</span>
    <strong class="pad-name">${pad.label}</strong>
  `;
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
  metroEnable: root.querySelector<HTMLInputElement>("#metroEnable")!,
  metroState: root.querySelector<HTMLElement>("#metroState")!,
  drumEnable: root.querySelector<HTMLInputElement>("#drumEnable")!,
  drumState: root.querySelector<HTMLElement>("#drumState")!,
  err: root.querySelector<HTMLElement>("#err")!,
  btnBankA: root.querySelector<HTMLButtonElement>("#btnBankA")!,
  btnBankB: root.querySelector<HTMLButtonElement>("#btnBankB")!,
  btnBankFill: root.querySelector<HTMLButtonElement>("#btnBankFill")!,
  patternStatus: root.querySelector<HTMLElement>("#patternStatus")!,
  btnClearTrack: root.querySelector<HTMLButtonElement>("#btnClearTrack")!,
  btnClearPattern: root.querySelector<HTMLButtonElement>("#btnClearPattern")!,
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

function patternStatusText(edit: 0 | 1 | 2): string {
  if (edit === 1) return "PATTERN B";
  if (edit === 2) return "FILL · HOLD TO AUDITION";
  return "PATTERN A";
}

function renderPatternGrid() {
  const s = link.getState();
  const tracks = currentTracks(s.pattern);
  for (let t = 0; t < TRACK_LABELS.length; t++) {
    els.trackLabels[t].classList.toggle("active", t === selectedTrack);
    for (let step = 0; step < 16; step++) {
      const cell = stepButtons[t][step];
      const vel = tracks[t][step];
      /* Binary UI: on/off only. Velocity still drives audio, not cell opacity. */
      cell.classList.toggle("on", vel > 0);
      cell.classList.toggle("playhead", s.running && s.step === step);
      cell.style.removeProperty("--vel");
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
  els.btnConnect.classList.toggle("connected", s.connected);
  els.btnConnect.classList.toggle("stale", s.sync === "stale");
  const syncText = !s.connected
    ? "连接设备"
    : s.sync === "connecting"
      ? "同步中…"
      : s.sync === "stale"
        ? `${s.deviceName} · 延迟`
        : `${s.deviceName} · 断开`;
  els.connLabel.textContent = syncText;
  els.btnConnect.ariaLabel = s.connected ? "断开设备" : "连接设备";
  els.btnConnect.title = s.connected ? "点击断开" : "点击连接";

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
  const ready = s.connected && s.sync !== "disconnected";
  els.btnTransport.disabled = !ready;
  els.tempoSlider.disabled = !ready;
  els.swingSlider.disabled = !ready;
  els.volumeSlider.disabled = !ready;
  els.metroEnable.disabled = !ready;
  els.drumEnable.disabled = !ready;
  if (document.activeElement !== els.metroEnable) {
    els.metroEnable.checked = s.click;
  }
  if (document.activeElement !== els.drumEnable) {
    els.drumEnable.checked = s.drumMode;
  }
  els.metroState.textContent = s.click ? "开" : "关";
  els.drumState.textContent = s.drumMode ? "开" : "关";
  els.btnClearTrack.disabled = !ready;
  els.btnClearPattern.disabled = !ready;
  els.btnBankA.disabled = !ready;
  els.btnBankB.disabled = !ready;
  els.btnBankFill.disabled = !ready;
  const now = Date.now();
  for (const pad of els.pads) {
    const idx = Number(pad.dataset.pad);
    pad.disabled = !ready;
    const lit = !!s.keysDown[idx] || now < (s.keyFlashUntil[idx] ?? 0);
    pad.classList.toggle("lit", lit);
    pad.classList.toggle("held", !!s.keysDown[idx]);
  }
  root.querySelector(".panel.drum")?.classList.toggle("layer-off", ready && !s.drumMode);
  root.querySelector(".panel.metro")?.classList.toggle("layer-off", ready && !s.click);

  els.btnBankA.classList.toggle("active", editBank === 0);
  els.btnBankB.classList.toggle("active", editBank === 1);
  els.btnBankFill.classList.toggle("active", editBank === 2);
  els.btnBankFill.classList.toggle("audition", s.fill);
  els.patternStatus.textContent = patternStatusText(editBank);

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

let keyFlashTimer = 0;
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
  const soonest = Math.min(...s.keyFlashUntil.filter((t) => t > Date.now()), Number.POSITIVE_INFINITY);
  if (Number.isFinite(soonest)) {
    if (keyFlashTimer) window.clearTimeout(keyFlashTimer);
    keyFlashTimer = window.setTimeout(() => render(), Math.max(16, soonest - Date.now() + 4));
  }
});

els.btnTransport.addEventListener("click", () => {
  const s = link.getState();
  if (s.running) link.sendStop();
  else if (s.bar === 0 && s.step === 0 && s.tick === 0) link.sendStart();
  else link.sendContinue();
});

els.metroEnable.addEventListener("change", () => {
  link.sendClick(els.metroEnable.checked);
});
els.drumEnable.addEventListener("change", () => {
  link.sendMode(els.drumEnable.checked);
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
  if (link.getState().connected) {
    link.sendFill(false);
    link.sendVariation(0);
  }
  render();
});
els.btnBankB.addEventListener("click", () => {
  editBank = 1;
  if (link.getState().connected) {
    link.sendFill(false);
    link.sendVariation(1);
  }
  render();
});

let fillPreviewTimer = 0;
let fillPreviewHeld = false;
els.btnBankFill.addEventListener("pointerdown", (ev) => {
  ev.preventDefault();
  editBank = 2;
  render();
  if (!link.getState().connected) return;
  fillPreviewHeld = false;
  if (fillPreviewTimer) window.clearTimeout(fillPreviewTimer);
  fillPreviewTimer = window.setTimeout(() => {
    fillPreviewHeld = true;
    link.sendFill(true);
  }, 280);
});
const endFillPreview = () => {
  if (fillPreviewTimer) {
    window.clearTimeout(fillPreviewTimer);
    fillPreviewTimer = 0;
  }
  if (fillPreviewHeld) {
    link.sendFill(false);
    fillPreviewHeld = false;
  }
};
els.btnBankFill.addEventListener("pointerup", endFillPreview);
els.btnBankFill.addEventListener("pointerleave", endFillPreview);
els.btnBankFill.addEventListener("pointercancel", endFillPreview);

els.btnClearTrack.addEventListener("click", () => {
  mutatePattern((p) => withCurrentTracks(p, clearTrack(currentTracks(p), selectedTrack)));
});
els.btnClearPattern.addEventListener("click", () => {
  mutatePattern((p) => withCurrentTracks(p, clearPattern(currentTracks(p))));
});

let s7HoldTimer = 0;
let s7FillArmed = false;
for (const pad of els.pads) {
  pad.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const idx = Number(pad.dataset.pad);
    const meta = HW_PADS[idx];
    if (!link.getState().connected || !meta) return;
    pad.classList.add("active", "lit");
    if (meta.role === "drum" && meta.note != null) {
      link.sendNote(meta.note, 127);
    } else if (meta.role === "abfill") {
      s7FillArmed = false;
      if (s7HoldTimer) window.clearTimeout(s7HoldTimer);
      s7HoldTimer = window.setTimeout(() => {
        s7FillArmed = true;
        link.sendFill(true);
      }, 280);
    } else if (meta.role === "play") {
      const s = link.getState();
      if (s.running) link.sendStop();
      else if (s.bar === 0 && s.step === 0 && s.tick === 0) link.sendStart();
      else link.sendContinue();
    }
  });
  const endS7 = (commitTap: boolean) => {
    if (s7HoldTimer) {
      window.clearTimeout(s7HoldTimer);
      s7HoldTimer = 0;
    }
    if (s7FillArmed) {
      link.sendFill(false);
      s7FillArmed = false;
    } else if (commitTap) {
      const next = link.getState().variation ? 0 : 1;
      link.sendVariation(next);
      editBank = next === 0 ? 0 : 1;
    }
  };
  pad.addEventListener("pointerup", () => {
    const idx = Number(pad.dataset.pad);
    const meta = HW_PADS[idx];
    pad.classList.remove("active");
    if (meta?.role === "abfill") endS7(true);
  });
  pad.addEventListener("pointerleave", () => {
    const idx = Number(pad.dataset.pad);
    const meta = HW_PADS[idx];
    pad.classList.remove("active");
    if (meta?.role === "abfill") endS7(false);
  });
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
    els.pads[idx]?.classList.add("active", "lit");
    window.setTimeout(() => els.pads[idx]?.classList.remove("active", "lit"), 120);
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
