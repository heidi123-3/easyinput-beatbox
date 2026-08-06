# EasyInput Beatbox 产品合同

本文件是项目层产品约定的可读版。Agent 开发时以 `.cursor/skills/easyinput-drum-machine/SKILL.md` 为准；硬件事实以 `easyinput-board-cy` 为准。

## 硬件基线

- 产品名：EasyInput V2.0
- 固件板型别名：v2
- PCB 丝印：AI Keyboard V2.1
- 扬声器路径：板载 MAX98357A（GPIO 见板级 Skill）
- 共享电源：GPIO8 同时供 WS2812 / MIC / SPK

## 阶段目标

### P0 · 冒烟

1. 按板级合同安全拉高 GPIO8
2. 5 颗 WS2812 显示可识别图案
3. MAX98357A 播放短 click

### P1 · 独立节拍器

- 旋钮调节 BPM（60–240，默认 120）
- 短按启停
- RGB 显示拍点/重拍
- 板端播放 click / accent

### P2 · 八轨鼓机

- 16 步 sequencer
- Live Pad 键位映射见鼓机 Skill
- Fill / Variation / Swing
- NVS 保存 Pattern

### P3 · 配套软件

- USB Serial / WebSerial
- Pattern / Kit 可视化编辑
- 与板端状态双向同步

## 非目标（现阶段）

- 不在板端跑大模型
- 不把 Wi-Fi 音频传输放进节拍实时路径
- 不修改或分叉 `easyinput-board-cy` 作为业务真相源
