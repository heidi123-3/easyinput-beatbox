# EasyInput Beatbox

基于 EasyInput V2.0 的节拍器 / 鼓机工程：板端实时发声与运输，电脑端可视化与 Pattern 编辑，USB 双向联动。

- **板级事实**：`easyinput-board-cy`
- **产品约定**：`.cursor/skills/easyinput-drum-machine`
- **固件**：`firmware/`
- **配套 UI**：`app/`（Chrome / Edge + Web Serial）
- **桌面壳**：`desktop/`（Electron；因 Web Serial 不用 Tauri）
- **主机协议**：`docs/host-protocol.md`（MIDI 语义见 `docs/midi-protocol.md`）

## 当前能力

- clave / 木块风格短瞬态 click + public-domain TR-707 PCM 鼓组
- 节拍器 / 鼓机双层独立开关，可同时启用；上电默认节拍器开、鼓机关
- 内部 **96 PPQN** 采样时钟调度；对外 MIDI Clock 语义为 24 PPQN
- 旋钮 BPM；4×2 Live Pad（上 CHH/OHH/Clap/Rim，下 Kick/Snare）；S7 短按 A/B、长按 Fill；编码器 / S8 Play-Stop
- 16 步 × 6 轨 Pattern（A/B/Fill）、Swing 50–75%、总音量、revision 同步
- USB Serial 主机协议 v2：状态 / 位置 / Pattern / 启停 / BPM
- 电脑端自动重连、节拍器面板 + 16 步编辑器；MIDI 适配层可单测

## 目录

```text
easyinput-beatbox/
├── .cursor/skills/
├── firmware/                 # ESP-IDF
├── app/                      # Vite + Web Serial 配套界面
├── desktop/                  # Electron 套壳（Web Serial）
├── docs/
│   ├── product-contract.md
│   ├── host-protocol.md
│   ├── midi-protocol.md
│   └── usb-midi-spike.md
└── scripts/
```

## 烧录固件

```bash
cd firmware
. ~/esp/v5.4.1/esp-idf/export.sh
idf.py set-target esp32s3
idf.py build

# 板子开机 → 短按一次 BOOT → 出现下载口后再执行：
idf.py -p /dev/cu.usbmodem* flash
```

烧完后请 **断电再开机**（USB RTS 复位在这套板上常会停在 download，不会跑用户程序）。电脑仍识别为 USB Serial（`cu.usbmodem*`）。

## 启动配套 UI

```bash
pnpm install
pnpm dev
pnpm test
```

用 **Chrome / Edge** 打开本地地址。首次点击「连接」授权 Espressif 串口；之后插拔可自动重连。连接后需收到 `hello` + `state` 才进入 synced。

### 桌面应用（Electron）

本应用依赖 Web Serial：macOS 上 Tauri 的系统 WebView 不支持，因此用 Electron。

```bash
# 开发：先起网页，再开桌面窗
pnpm dev          # terminal 1 — Vite :5173
pnpm desktop:dev  # terminal 2 — Electron

# 或加载已构建的 app/dist
pnpm desktop:start
```

桌面窗内点击「连接」即可选串口（会优先 Espressif VID）。

## 硬件交互

| 操作 | 行为 |
| --- | --- |
| 旋转编码器 | BPM 60–240 |
| 短按编码器或 S8 | Play / Stop（Start 归零） |
| S1–S4 | CHH / OHH / Clap / Rim（上排） |
| S5–S6 | Kick / Snare（下排根基） |
| S7 | 短按 A/B；长按 Fill |
| RGB | 5 灯 ping-pong 走拍；重拍偏暖色 |

## 为什么是「MIDI 语义 + Serial 承载」

- MIDI 的 Start/Stop/Continue/Clock/SPP 与 GM 通道 10 适合节拍器 → 鼓机扩展
- ESP32-S3 上 USB MIDI class 与烧录用的 USB-Serial/JTAG 抢同一 PHY，macOS 上不稳定
- 因此当前用 Web Serial 承载领域事件；`app/src/midi-adapter.ts` 提供标准 MIDI 字节映射
- USB MIDI class 可行性见 `docs/usb-midi-spike.md`；未过门槛前不替换 Serial

板端继续负责实时发声；电脑端负责可视化、编辑与同步。

## Skill

```bash
./scripts/setup_skills.sh
```

## 许可

Apache-2.0。
