# AI 桌面宠物 · 小团子 🐱

一只运行在 Windows 桌面上的像素猫咪，透明悬浮、常驻桌面，具备 **自主行为**、**AI 对话**、**养成系统**、**定时提醒** 四大核心能力。

> 基于《AI 桌面宠物技术设计方案》实现。猫咪形象采用联网获取的 **CC0 公有领域** 开源像素素材（OpenGameArt，作者 Shepardskin），见 [CREDITS.md](./CREDITS.md)。

## ✨ 功能

- **透明置顶 + 点击穿透**：全屏透明覆盖层，非猫咪区域鼠标可穿透到桌面，不干扰办公。
- **像素动画（PixiJS）**：待机呼吸、行走、奔跑；`NEAREST` 缩放保持像素锐利。
- **自主行为**：状态机 + 行为树驱动，自动踱步、打哈欠、久置睡觉、无聊时自娱自乐。
- **交互**：左键点击有反应、拖拽自由移动、双击摸头、右键弹操作菜单、系统托盘菜单。
- **养成系统**：饱腹度 / 心情 / 好感 / 经验 / 等级，自然衰减，喂食/玩耍/互动成长。
- **AI 对话**：OpenAI 兼容接口，「小团子」傲娇性格，打字机气泡，情绪驱动动画。**未配置 API Key 时自动使用离线话术，应用照常可用。**
- **定时提醒**：node-cron 调度 + 系统通知 + 猫咪反应；内置番茄钟/喝水/护眼/午饭/晚安预设。
- **激光笔小游戏**：红点随机移动，猫自动追逐，点击改变光点位置。

## 🚀 运行

```bash
npm install      # 安装依赖（已配置 Electron 国内镜像见下）
npm start        # 启动桌面宠物
```

> **国内网络**：Electron 二进制默认从 GitHub 下载，可能超时。如安装失败，先设置镜像：
> ```bash
> npm config set registry https://registry.npmmirror.com
> set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/   # Windows CMD
> npm install
> ```

启动后猫咪出现在桌面右下角（或上次退出的位置）：
- **左键拖拽**：移动猫咪 · **左键单击**：逗它 · **双击**：摸头
- **右键猫咪 / 托盘图标**：打开菜单（聊天/喂食/玩耍/状态/提醒/设置/退出）

## ⚙️ 配置 AI 对话

右键 → 设置，填写：
- **API Key**：OpenAI 兼容密钥（留空则用离线话术）
- **Base URL**：如 `https://api.openai.com/v1`，也可填兼容服务（DeepSeek / 通义 / 本地 Ollama 等）
- **模型**：如 `gpt-4o-mini`

## 📦 打包（可选）

```bash
npm run build:win    # 生成 Windows 安装包（electron-builder）
```

## 🗂 项目结构

```
src/
├── main/        主进程：窗口/托盘/JSON存储/cron调度/IPC/开机自启
├── preload.js   contextBridge 暴露白名单 API
├── renderer/    渲染进程
│   ├── pet/     Pet / StateMachine / BehaviorTree / Interaction
│   ├── ui/      气泡 / 菜单 / 状态 / 设置 / 提醒 面板
│   ├── ai/      ChatService
│   └── games/   MiniGameBase / LaserChase
└── shared/      constants / personality
```

## 🔧 技术决策（相对设计文档的务实调整）

- **持久化**用 JSON 文件（`userData/petdata.json`）替代 better-sqlite3，避免原生编译，保证开箱即跑。
- **纯 JS + PixiJS UMD** 替代 TS + Vite，减少构建失败点。
- sleep/eat/happy 缺专用 CC0 帧，用 idle/walk/run + 变色/Zzz/弹跳/粒子 等特效优雅替代。
- 小游戏先实现「激光笔追逐」，接食物/抚摸留 `MiniGameBase` 扩展接口。

## 📄 许可

代码 MIT。猫咪素材 CC0，详见 [CREDITS.md](./CREDITS.md)。
