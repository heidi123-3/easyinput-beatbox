# EasyInput Beatbox 主机协议

## 结论

对这套板子，**当前主链路是 USB-Serial/JTAG + Web Serial**，消息语义对齐 MIDI 运输（Start/Stop、BPM、拍号、通道 10 打击乐映射）。

为什么不先上 USB MIDI class device：

- ESP32-S3 的 USB-OTG 与 USB-Serial/JTAG **共用一根 PHY**
- macOS 上 ROM 会先枚举成 JTAG/Serial；TinyUSB 再抢口时经常失败或需拔插/烧 eFuse
- EasyInput 日常烧录也依赖该串口；先保证配套 UI 稳定自动连接更重要

MIDI 语义表仍见 `midi-protocol.md`（DAW / 后续 class-compliant 设备复用同一映射）。

## 帧格式

UTF-8，一行一条 JSON，`\n` 结尾。非 `{` 开头的行忽略（兼容偶发日志）。

### Device → Host

| 消息 | 含义 |
| --- | --- |
| `{"t":"hello","v":1,"name":"EasyInput Beatbox"}` | 广播身份，便于 UI 锁定 |
| `{"t":"state","bpm":120,"run":0,"beat":0}` | 状态快照（约 2 Hz） |
| `{"t":"beat","accent":1,"beat":0}` | 拍点；`accent=1` 为重拍 |
| `{"t":"start"}` / `{"t":"stop"}` | 运输变化 |

`beat`：小节内拍号 `0..3`。

### Host → Device

| 消息 | 含义 |
| --- | --- |
| `{"t":"start"}` / `{"t":"continue"}` | 开始 |
| `{"t":"stop"}` | 停止 |
| `{"t":"bpm","v":128}` | 设置 BPM（60–240） |
| `{"t":"ping"}` | 请求 `hello` |

## 配套 UI

`app/` 使用 Web Serial：

1. 首次点击「连接」，授权 Espressif（VID `0x303A`）串口
2. 之后插拔可自动重连（`navigator.serial.getPorts()`）
3. 可视化 BPM、PLAYING/STOPPED、拍点与钟摆

## 与 MIDI 的对应

| JSON | MIDI |
| --- | --- |
| `start` / `stop` | `0xFA` / `0xFC` |
| `state.bpm` | CC16/CC17 |
| `state.run` | CC19 |
| `beat` / `state.beat` | CC18 + Note 76/77 |
| （后续）Clock | `0xF8` 24 PPQN |

鼓机阶段继续扩展同一语义下的 GM Ch.10 音符，不必另起一套实时协议。
