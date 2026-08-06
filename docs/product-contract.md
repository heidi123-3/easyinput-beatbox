# EasyInput Beatbox 产品合同

硬件事实以 `easyinput-board-cy` 为准；本文件描述产品层行为。

## 音色目标

参考录音室 click / clave / 木块实践：

- 干声、短瞬态、锐利起音（当前 click 约 9 ms）
- 主体约 2.0–2.5 kHz clave 感，而不是长鸣正弦或刺耳方波
- 削去过高频能量，降低长时间听感疲劳
- 重拍与普通拍以音高/音色区分，音量差保持克制

板端合成实现见 `firmware/main/audio/audio_click.c`。

## 时钟与音频链路

- I2S `32000 Hz` 采样时钟是唯一节拍时间源；UI、USB 与灯光不得驱动声音触发
- 连续渲染 `128 frame`（4 ms）音频块，不在每拍临时启动/停止 DMA
- Q32 定点相位累计决定拍点在音频块内的精确采样位置，避免整数 BPM 截断漂移
- 外部音符进入队列；8 个预分配 voice 独立播放并在 `int32` 累加器中混音
- 音频线程不分配内存、不等待 UI/USB 锁，也不执行灯带更新
- `scripts/check_timing_model.py` 必须覆盖 60–240 BPM、每档 30 分钟；允许误差不超过 1 sample

## 交互目标

参考机械节拍器与常见桌面节拍器：

- 板端可独立使用：旋钮 BPM + 编码器/S8 启停
- 视觉可预期下一拍（灯来回走；电脑端钟摆 + 拍点灯）
- 电脑端连接后自动识别设备，显示 BPM、运行态、拍号
- 键盘：空格启停，方向键微调 BPM
- 为鼓机预留 Pad / 序列界面，不把节拍器做成死胡同产品

## 连接

- **当前主通道**：USB Serial + Web Serial（`host-protocol.md`）
- **语义合同**：MIDI 运输 / GM Ch.10（`midi-protocol.md`）
- 选择原因：ESP32-S3 共享 PHY，macOS 上 TinyUSB MIDI 易被 JTAG/Serial 抢枚举；Serial 可稳定烧录+联动

## 阶段

| 阶段 | 状态目标 |
| --- | --- |
| P1 | 独立节拍器 + 主机链路 + 配套 UI |
| P2 | 八键鼓机 / 16 步，复用通道 10 语义 |
| P3 | UI 编辑 Pattern / Kit；可选 USB MIDI class |
