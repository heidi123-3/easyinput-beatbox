# EasyInput Beatbox

基于 [EasyInput V2.0](../easyinput-board-cy) 的节拍器 / 鼓机工程：板端实时发声与运输，电脑端可视化，USB 双向联动。

- **板级事实**：`easyinput-board-cy`
- **产品约定**：`.cursor/skills/easyinput-drum-machine`
- **固件**：`firmware/`
- **配套 UI**：`app/`（Chrome / Edge + Web Serial）
- **主机协议**：`docs/host-protocol.md`（MIDI 语义见 `docs/midi-protocol.md`）

## 当前能力

- clave / 木块风格短瞬态 click（低音量、去刺耳高频）
- 旋钮 BPM，编码器按键 / S8 Play-Stop
- 5 灯来回走拍点
- USB Serial 主机链路：状态 / 拍点 / 启停 / BPM
- 电脑端自动重连，显示 BPM / 播放状态 / 拍点 / 钟摆，并预留鼓机区域

## 目录

```text
easyinput-beatbox/
├── .cursor/skills/
├── firmware/                 # ESP-IDF
├── app/                      # Vite + Web Serial 配套界面
├── docs/
│   ├── product-contract.md
│   ├── host-protocol.md
│   └── midi-protocol.md
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
```

用 **Chrome / Edge** 打开本地地址。首次点击「连接」授权 Espressif 串口；之后插拔可自动重连。

## 硬件交互

| 操作 | 行为 |
| --- | --- |
| 旋转编码器 | BPM 60–240 |
| 短按编码器或 S8 | Play / Stop |
| RGB | 5 灯 ping-pong 走拍；重拍偏暖色 |

## 为什么是「MIDI 语义 + Serial 承载」

- MIDI 的 Start/Stop/Clock 与 GM 通道 10 适合节拍器 → 鼓机扩展
- ESP32-S3 上 USB MIDI class 与烧录用的 USB-Serial/JTAG 抢同一 PHY，macOS 上不稳定
- 因此 P1 用 Web Serial 承载同等语义，保证配套 UI 能用；class-compliant MIDI 作为后续选项

板端继续负责实时发声；电脑端负责可视化与控制。

## Skill

```bash
./scripts/setup_skills.sh
```

## 许可

Apache-2.0。
