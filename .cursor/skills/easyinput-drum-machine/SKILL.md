---
name: easyinput-drum-machine
description: EasyInput Beatbox 产品与固件约定。定义 BPM、键位映射、采样格式、Pattern/协议与验收门槛。在开发、修改或评审 easyinput-beatbox 鼓机/节拍器固件与配套软件时使用；硬件脚位、BOOT、GPIO8 与外设连线必须先读取 easyinput-board-cy，不要在本 Skill 中复制第二份 pinout。
---

# EasyInput Beatbox 产品约定

## 定位

本 Skill 只定义 **easyinput-beatbox** 的产品行为与项目合同。板级硬件事实一律交给 `easyinput-board-cy`。

工作流：

1. 先使用 `easyinput-board-cy` 读取本次涉及的按键、编码器、GPIO8、WS2812、扬声器事实与安全边界。
2. 再按本 Skill 实现 BPM、键位语义、采样、Pattern 与软件协议。
3. 写完板级相关代码后，对 `firmware/` 运行板级基线扫描（见下方脚本）。
4. 静态 PASS 只说明未见已建模冲突；发声与节拍仍需真机验收。

## 产品目标

分阶段交付：

| 阶段 | 目标 |
| --- | --- |
| P0 | GPIO8 安全上电 → RGB 闪一下 → MAX98357A 播放 click |
| P1 | 独立节拍器：旋钮调 BPM，短按启停，RGB 拍点，板端发声 |
| P2 | 八键鼓机：16 步序列、Fill/Variation/Swing、NVS 保存 |
| P3 | 配套软件：USB Serial/WebSerial 编辑 Pattern 与音色包 |

实时节拍调度与发声必须在板端完成；电脑端只做编辑与同步。

## 交互合同（项目层）

### 旋钮

- 旋转：默认 ±1 BPM；快速旋转可加速到 ±5 BPM
- 短按：Play / Pause
- 按住并旋转：Swing（50%–75%）
- 长按：进入设置层（RGB 全亮提示）

BPM 默认范围：`60–240`，启动默认 `120`。

### 按键默认映射（Live Pad）

| 丝印 | 功能 | 备注 |
| --- | --- | --- |
| S1 | Kick | 长按清空本轨 |
| S2 | Snare | 长按切换音色变体 |
| S3 | Closed HH | 可实时点按录入 |
| S4 | Open HH | 与闭镲互斥 |
| S5 | Clap / Perc | 打击乐 |
| S6 | Fill | 按住临时加花，松开回主循环 |
| S7 | Variation | A/B Pattern 切换 |
| S8 | Play / Stop | 长按保存 Pattern |

正常演奏只用短按、旋转、按住；长按只承担保存/清空/设置。

### RGB

5 灯无法逐格显示 16 步。默认：

- 4 灯表示四拍位置
- 1 灯表示运行/停止或设置态
- 重拍用更高亮度或不同颜色区分

## 音频合同（项目层）

- 输出路径：板载 MAX98357A（脚位见 `easyinput-board-cy`）
- MVP 采样：`22050 Hz`、16-bit、mono PCM
- 短采样预解码后播放；双缓冲 DMA；音频任务高优先级
- 关键 click/accent 样本优先放内部 RAM；更大 kit 可再用 PSRAM（需在固件中启用）
- 麦克风暂不进入 P0/P1 实时链路；若后续并用，必须单独验证 I2S 并发

GPIO8 冷启动/关断顺序必须遵守 `easyinput-board-cy` 的电源合同。本项目默认：演奏或显示期间保持共享电源开启，不在清醒态频繁开关 GPIO8。

## 时序合同（项目层）

- 禁止用普通 `delay()` 推进拍子
- 内部建议 `96 PPQN`；16 分音符 = 24 tick
- Swing 调整偶数子拍触发点
- BPM 变化在下一 tick 平滑生效
- P1 验收：60/120/240 BPM 下记录平均误差、峰值抖动与约 30 分钟漂移

## 软件协议（P3，先占位）

USB Serial / WebSerial 优先；命令语义先冻结字段名，编码可后定：

- `transport`：play / stop / continue
- `tempo`：BPM
- `pattern`：步序读写
- `kit`：音色包清单
- `status`：position、version、battery（若启用）

不要把 Wi-Fi/BLE 时延放进实时节拍链路。

## 仓库约定

- 固件根目录：`firmware/`
- 板级引脚常量：`firmware/main/board/board_pins.h`（数值必须与 `easyinput-board-cy` 合同一致，不另起真相源）
- 产品说明：`docs/product-contract.md`
- 板级扫描：

```bash
./scripts/check_board_baseline.sh
```

## 禁止事项

- 不在本 Skill 或业务代码注释里维护第二份完整 pinout 真相源
- 不把“按住 BOOT + 上电”写进文档或课程
- 不把 GPIO8 当成只控制灯带的开关
- 不从其他 EasyInput 应用默默继承按键动作、分区、协议或电源策略
- 不把静态 checker PASS 写成真机已通过

## 额外资料

- 产品细节与阶段说明：`docs/product-contract.md`
- 板级事实：先读 `easyinput-board-cy`
