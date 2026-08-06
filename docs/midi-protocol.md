# EasyInput Beatbox MIDI 语义

这是软硬件联动的**语义合同**（运输 + GM 通道 10）。  
当前固件用 USB Serial 承载同等语义（见 `host-protocol.md`）；后续若启用 USB MIDI class device，消息映射保持一致。

## 为什么用 MIDI 语义

- Start / Stop / Clock 是标准运输语义，适合节拍器与后续跟拍
- 通道 10 打击乐映射与 GM 兼容，鼓机阶段可自然扩展
- 电脑端可用 WebMIDI / DAW；当前阶段用 Web Serial 承载同等字段
- 板端继续负责实时发声；电脑端负责可视化与编辑

## Device → Host（语义）

| 消息 | 含义 |
| --- | --- |
| `0xFA` Start | 开始播放 |
| `0xFC` Stop | 停止 |
| `0xF8` Clock | 运行中 24 PPQN（后续） |
| Ch.10 Note 76 | 重拍（High Wood Block） |
| Ch.10 Note 77 | 普通拍（Low Wood Block） |
| CC16 + CC17 | BPM：`BPM = (CC16<<7) \| CC17` |
| CC18 | 小节内拍号 0–3 |
| CC19 | 运行状态 0/1 |

## Host → Device（语义）

| 消息 | 含义 |
| --- | --- |
| Start / Continue | 开始或继续 |
| Stop | 停止 |
| CC16 / CC17 | 设置 BPM（同上编码） |

## 鼓机预留（后续）

仍在通道 10，建议：

| Note | 用途 |
| --- | --- |
| 36 | Kick |
| 38 | Snare |
| 42 | Closed HH |
| 46 | Open HH |
| 39 | Clap |

板端 Live Pad 与电脑端鼓机组共用同一映射。
