# EasyInput Beatbox

基于 [EasyInput V2.0](../easyinput-board-cy) 开发板的节拍器 / 鼓机二次开发工程，面向合作课程与可演示原型。

- **板级事实**：`easyinput-board-cy`（不要在本仓库复制第二份 pinout 真相源）
- **产品约定**：`.cursor/skills/easyinput-drum-machine`
- **固件**：`firmware/`（ESP-IDF / ESP32-S3）

## 当前阶段

骨架已就绪，目标先跑通 **P0/P1**：

1. GPIO8 安全上电
2. WS2812 拍点反馈
3. MAX98357A 播放 click
4. 旋钮调 BPM，短按 Play/Pause

## 目录

```text
easyinput-beatbox/
├── .cursor/skills/
│   ├── easyinput-board-cy/          # 软链接到旁边的官方板级 Skill
│   └── easyinput-drum-machine/      # 本项目产品 Skill
├── firmware/                        # ESP-IDF 工程
├── docs/product-contract.md
├── scripts/
│   ├── setup_skills.sh
│   └── check_board_baseline.sh
└── assets/samples/
```

## Skill 导入

本机已通过软链接导入；换机器或链接断了时执行：

```bash
./scripts/setup_skills.sh
```

这会同时配置：

- 项目内：`.cursor/skills/easyinput-board-cy` → `../easyinput-board-cy`
- 个人：`~/.cursor/skills/easyinput-board-cy`
- 个人：`~/.cursor/skills/easyinput-drum-machine`

新对话可直接说：

```text
先使用 easyinput-board-cy 读取本次相关板级事实，
再使用 easyinput-drum-machine 按产品合同继续开发 firmware/。
```

要求旁边存在同级仓库：`Documents/GitHub/easyinput-board-cy`。

## 构建与烧录

需要已安装 ESP-IDF（建议 5.x），并接好匹配扬声器。

```bash
cd firmware
idf.py set-target esp32s3
idf.py build

# EasyInput V2：开机状态下短按一次 BOOT 进入下载模式
idf.py -p /dev/cu.usbmodem* flash monitor
```

退出下载模式：关机后再开机，不要再次按 BOOT。

## 板级基线扫描

```bash
./scripts/check_board_baseline.sh
```

`PASS` 只表示静态扫描未见已建模冲突，不代表真机能响或节拍稳定。

## 交互（P1）

| 操作 | 行为 |
| --- | --- |
| 旋转编码器 | 调节 BPM（60–240） |
| 短按编码器 | Play / Pause |
| RGB | 前 4 灯拍点，第 5 灯运行指示 |

八键鼓机映射见 `.cursor/skills/easyinput-drum-machine/SKILL.md`。

## 许可

Apache-2.0。EasyInput / WaytoAGI 等品牌标识归其权利人所有；板级原理图与 PCB 证据仍以 `easyinput-board-cy` 为准。
