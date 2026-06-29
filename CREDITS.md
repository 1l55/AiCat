# 素材署名 / Credits

## 猫咪精灵（Cat sprites）

- **来源 / Source**: [OpenGameArt.org — Cat sprites](https://opengameart.org/content/cat-sprites)
- **作者 / Author**: Shepardskin
- **许可 / License**: **CC0 1.0 Universal (公有领域 / Public Domain)** — 可自由商用、修改、再分发，无需署名（此处署名仅出于尊重与致谢）。
- **使用说明**: 原始素材为 GIF 动画（`catwalkx2.gif` / `catrunx2.gif` 等）。本项目使用纯 JS（omggif + pngjs）将其解码、抠除背景色 RGB(164,117,160) 转为透明 PNG 精灵表：
  - `assets/sprites/cat-walk.png` — 6 帧行走循环（每帧 36×30）
  - `assets/sprites/cat-run.png` — 6 帧奔跑（每帧 40×34）
  - `assets/sprites/cat-idle.png` — 待机基帧（36×30）
  - `assets/sprites/cat-meta.json` — 帧尺寸/数量元数据

## 第三方库

- [Electron](https://www.electronjs.org/) — MIT
- [PixiJS](https://pixijs.com/) — MIT（`assets/vendor/pixi.min.js` 为其 UMD 构建）
- [node-cron](https://github.com/node-cron/node-cron) — ISC
