# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron desktop pet ("小团子", a pixel cat) that renders as a **full-screen transparent, always-on-top, click-through overlay** on the Windows desktop. Core systems: autonomous behavior, AI chat, a growth/养成 system with **variable reward mechanics** (critical hits, combo system), cron reminders, and a **collection system where 17 achievements unlock tint-based skins and code-drawn accessories** (零新增美术).

## Commands

```bash
npm start          # run the app
npm run dev        # run with --dev: forwards renderer console + load/crash events to stdout
npm run build:win  # package a Windows installer via electron-builder
```

There is **no test suite, linter, or bundler**. To sanity-check a change without launching the GUI:

```bash
# syntax-check any file (renderer files use window globals but node --check only parses)
node --check src/renderer/main.js
```

### Install gotcha (this machine / China network)
`npm install` downloads the Electron npm package fine but its postinstall binary fetch from GitHub times out. Use the mirror:
```bash
npm config set registry https://registry.npmmirror.com
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

### Verifying the cat actually renders
A GDI/PowerShell screenshot **cannot capture the hardware-composited transparent WebGL overlay** — the screenshot looks empty even when the cat is visible on screen. Do not conclude "nothing renders" from a blank screenshot. Instead run with `--dev` and read renderer logs, or use `app.renderer.extract.pixels(pet.sprite)` to count opaque pixels directly from Pixi's framebuffer.

## Architecture

Two-process Electron app, **plain JavaScript, no build step**. The renderer loads PixiJS and all renderer modules as ordered `<script>` tags from `src/renderer/index.html` (no imports/bundler); each module attaches a class/object to `window`.

### Main process (`src/main/`, CommonJS)
- `index.js` — app lifecycle, single-instance lock, wires all modules together. The app is tray-resident: closing windows does **not** quit (only `app.isQuiting` does).
- `window-manager.js` — creates the overlay window sized to the primary display's `workArea`. `setInteractive(v)` toggles `setIgnoreMouseEvents(true,{forward:true})`; default is click-through, flipped on only when the cursor is over the cat or a panel is open.
- `ipc.js` — **all** `ipcMain` handlers + the per-minute attribute decay loop (with floor protection) + the OpenAI-compatible `fetch` proxy (`callLLM`). The API key lives only in main; it is never exposed to the renderer. **Core reward logic**: handles variable rewards (±20% variance), critical hits (10%/15%/5% for feed/play/pet), combo bonuses (5% per combo, max 30%), and achievement unlocking. **Achievement→reward**: the `tryUnlock(key)` helper unlocks an achievement *and* its linked skin and/or accessory (per the `ACHIEVEMENTS` catalog), then auto-equips them. Threshold achievements are checked via a data-driven `conditions` map, not inline blocks. Counters (`feedCount`, `chatCount`) increment in the feed/chat handlers; `companionDays` increments once per local calendar day inside `STATE_GET` (which also silently unlocks `weekCompanion` at 7 days). Handlers `ACHIEVEMENTS_GET` / `SKIN_SET` / `ACCESSORY_SET` serve the achievement/形象 panel.
- `store.js` — JSON persistence at `app.getPath('userData')/petdata.json` (chosen over SQLite to avoid native compilation). Debounced writes; deep-merges defaults so new fields are backward-compatible. Manages achievements via `unlockAchievement(key)`, skins via `unlockSkin`/`setActiveSkin`, accessories via `unlockAccessory`/`setAccessory(slot,key)` (key=null unequips that slot). **`reconcileUnlocks()` runs on `init()`** — backfills `unlockedSkins`/`unlockedAccessories` from already-true achievements, so saves predating the skin/accessory systems retroactively get their rewards (without it, those rewards would be permanently locked).
- `scheduler.js` — node-cron jobs from stored reminders → Electron `Notification` + IPC to make the cat react.
- `tray.js`, `autostart.js` — system tray menu; `app.setLoginItemSettings`.

### Renderer (`src/renderer/`)
- `main.js` — orchestrator. `boot()` (on `DOMContentLoaded`) creates the transparent `PIXI.Application`, loads the pet, then constructs the state machine, behavior tree, bubble, all panels, chat, interaction, and the ticker loop. Holds the canonical `currentPet` and routes tray/IPC events to actions. **Handles reunion bonuses** (2+ hour absence), **farewell messages** (10min idle), and **achievement notifications** via the shared `announceAchievements()` helper (particles + bubble, announcing the skin/accessory each achievement unlocks). **Applies equipped skin AND accessories** (`pet.setSkin` + `pet.setAccessories`) on boot and on every status push (so a `SKIN_SET`/`ACCESSORY_SET` round-trips and repaints live).
- `pet/Pet.js` — slices sprite sheets (per `assets/sprites/cat-meta.json`) into `Texture[]` with `NEAREST` scaling; one `AnimatedSprite`. The cat moves **within the canvas** (dragging moves the sprite, not the window) and persists `posX/posY`. **Visual state system**: `applyMood()` adjusts tint and breathing amplitude based on hunger/mood (hungry→gray-green tint, low mood→gray tint, happy→brighter breathing). `celebrate()` spawns 16 gold particles for level-ups and critical hits. **Facing logic**: sprite defaults to facing left; `setFacing(dir)` where dir>0 flips to face right (scale.x becomes negative). **Skin tint layering**: the equipped skin is the *base* color (`setSkin(tint)`); state/mood tints (sleep/hungry/low-mood) are multiplied *on top* via `blendTint()`, so e.g. a pink cat still reads as cool-toned while asleep. All tint writes go through the internal `_tint(stateTint)`, never `sprite.tint=` directly. **Accessory rendering**: `setAccessories({slot:key})` rebuilds two `PIXI.Container` layers from the `ACC_DRAW` vector-draw map (PIXI.Graphics, no art) — `accessoryLayer` (head/body/feet) sits *above* the sprite, `wingsLayer` (back-slot wings) also sits above the sprite so wings overlay the back rather than being hidden behind the opaque body. `_syncAccessoryTransform()` (called each frame) keeps both layers locked to the sprite's scale/facing/bob. Accessory local coords use feet-center origin (head ≈ y=-29).
- `ui/` — HTML-overlay panels (bubble, radial right-click menu, status, settings, reminders, achievements). When any panel is open, the window is forced interactive. **ReminderPanel** uses hour/minute dropdowns (not raw cron input) and displays times as "每天 09:00". **MenuPanel** is a radial/arc menu: icon buttons fan out over the upper semicircle from the click point with a staggered pop-in (`--tx/--ty/--d` CSS vars set in `openAt`), `.open` class drives the transition. **AchievementPanel** (`ui/AchievementPanel.js`) shows progress + a skin wardrobe grid + an accessory wardrobe grouped by slot (each slot has a "无"/none cell to unequip) + the achievement wall; clicking unlocked items calls `setSkin`/`setAccessory` and the `onSkinChange`/`onAccessoryChange` callbacks repaint the cat live.
- `pet/StateMachine.js` + `pet/BehaviorTree.js` — FSM (IDLE/WALK/SLEEP/EAT/CHAT/PLAY) driven by a priority behavior tree (hunger > sleep-when-idle > boredom tricks > wander). `sm.locked` protects EAT/CHAT/PLAY from autonomous interruption. **Walk behavior**:行走时固定朝向存储在 `walkDir`，避免每帧重新计算导致抖动。行走概率25%（非55%），待机时间5-12秒，减少过度行走。**Hunger nagging**: 基础间隔90秒，每次忽视+60秒（最长4分钟），喂食后重置 `hungerNagCount`。
- `pet/Interaction.js` — pointer handling + the **passthrough toggle**: even while click-through, `forward:true` still delivers `mousemove`, so hover detection flips the window interactive, which then enables clicks/drag.
- `ai/ChatService.js` — AI chat integration with emotion parsing.
- `games/LaserChase.js` — **鼠标控制的激光游戏**：光点跟随鼠标移动，猫追逐，距离<25px算抓到（即时弹跳+话术）。游戏时长20秒，抓到次数影响奖励倍数（最高2x）。**退出机制**：顶部显示"按ESC或点击此处退出"，支持ESC键或点击退出。
- `games/MiniGameBase.js` — base class for mini-games.

### Shared (`src/shared/`, dual-export)
`constants.js` and `personality.js` export via both `module.exports` (main, `require`) and `window.*` (renderer, `<script>`). **`src/preload.js` cannot import these** — it inlines the IPC channel names, so channel changes must be edited in both `constants.js` and `preload.js`.

> ⚠️ **Naming gotcha**: these files are loaded as sibling top-level `<script>`s (not modules), so a top-level `const X` in one collides with the same name in another (`Identifier 'X' has already been declared`, which silently aborts the *second* script). `constants.js` owns the top-level name `data`; every other shared file must use a unique export-object name (e.g. `personality.js` uses `personalityData`). Don't add another top-level `const data`.

**constants.js** defines:
- `DEFAULT_DATA` with all persisted fields: counters `comboCount`/`lastInteractionAt`/`totalInteractions`/`feedCount`/`chatCount`/`companionDays`/`lastActiveDay`, appearance `activeSkin`+`unlockedSkins`+`unlockedAccessories`+`equippedAccessories` (`skinColor` is a legacy field, unused), `achievements` (17 个成就标记), `lastSeenAt` (重逢计算)
- `FLOOR = { hunger: 15, mood: 20 }` — 属性衰减下限
- `SKINS` — skin catalog (16 entries: `default` + one per skin-granting achievement), each `{ key, name, tint, achievement, desc }`. Tints are **multiplicative** (only darken/shift hue, never brighten — light skins may read gray on a dark base sprite).
- `ACCESSORIES` — accessory catalog (9 entries), each `{ key, name, slot, color, achievement, desc }`. `ACC_SLOTS = ['head','body','feet','back']`; same-slot items are mutually exclusive, cross-slot stack. `color` feeds the vector-draw map in `Pet.js`.
- `ACHIEVEMENTS` — single source of truth for the 17 achievements: `{ key, name, desc, skin?, accessory? }` — `skin`/`accessory` (either or both, optional) name the reward keys. Used by `ipc.js` (unlock logic), `store.js` (backfill), and `AchievementPanel.js` (display).
- `skinTint(key)` / `accessoryDef(key)` — lookup helpers.

**personality.js** defines:
- `affectionTier(affection)` — 根据好感度返回称呼（喂/你/主人）与语气
- `buildSystemPrompt(pet)` — 注入当前关系阶段、人设底线（嘴硬心软，结尾总有暖意）、伦理红线（不卖惨、不绑架）
- `OFFLINE_LINES` — 分层话术库，支持 `reunion`（重逢）、`farewell`（告别）、`hungry`（求助式）场景

### Cross-cutting contracts
- **IPC**: channel names are defined in `shared/constants.js` (`IPC`), surfaced to the renderer through the `window.petAPI` whitelist in `preload.js`. Adding an IPC call means touching `constants.js` → `preload.js` → an `ipcMain` handler in `ipc.js`. **`requestAction(action, opts)` now accepts optional `opts` parameter** for passing game performance data like `catchCount`. **Appearance channels**: `ACHIEVEMENTS_GET` (returns `{achievements, activeSkin, unlockedSkins, equippedAccessories, unlockedAccessories}`), `SKIN_SET` (equips an unlocked skin), `ACCESSORY_SET` ({slot,key}; key=null unequips) — both push status to repaint.
- **CSP** (`index.html`): PixiJS v7 requires `script-src 'unsafe-eval'` (shader compile), `worker-src/script-src blob:` (image-loader worker), and `connect-src data:` (empty texture). Removing these breaks rendering.
- **Emotion tags**: AI replies end with `[emotion:xxx]`; `ipc.js` parses it out and the renderer maps it to a pet reaction. With no API key (or on failure), `personality.js#offlineReply` provides scene-based fallback lines so chat always works.
- **Script loading order in index.html**: `pixi.min.js` → `constants.js` → **`personality.js`** → pet modules → UI modules → games → `main.js`. **`personality.js` must be loaded before any module that uses `window.PetPersonality`**.

## Core Systems

### Variable Reward System (上瘾机制)
Implemented in `ipc.js` `PET_REQUEST_ACTION` handler:
- **Reward variance**: base value ±20% random fluctuation
- **Critical hits**: feed 10%, play 15%, pet 5% (3x multiplier for pet crits)
- **Combo system**: 10-second window, +5% per combo (max 30% at 6+ combos)
- **Visual feedback**: critical hits trigger `pet.celebrate()` particles + special dialogue; combos show "⚡ X连击！" at ≥3

### Achievement System
17 achievements, defined as a catalog in `constants.js#ACHIEVEMENTS` (single source of truth) and tracked as booleans in the `achievements` object. Each entry may carry an optional `skin` and/or `accessory` reward key:
- Interaction/combo: `firstFeed`, `combo5`, `combo10`, `combo20`, `criticalHit`, `laserMaster`
- Progression: `level5`, `level10`, `level20`, `affection50`, `affection100`
- Cumulative counters: `interactions100`, `interactions500`, `feedMaster` (50 feeds), `chatMaster` (30 chats), `weekCompanion` (7 distinct days), `nightOwl` (interact 23:00–06:00)

Counters live on `pet`: `feedCount`/`chatCount` increment in the feed/chat handlers; `companionDays` is bumped once per local calendar day by `store.bumpCompanionDay()` (called from `STATE_GET`, which is why `weekCompanion` can unlock silently at boot rather than on an interaction).

Unlocking runs through `ipc.js#tryUnlock(key)`, a data-driven helper that, on a *newly* unlocked achievement, (1) records it, (2) unlocks **and auto-equips** the linked skin and/or accessory, and (3) returns an entry `{key,name,desc,skin,accessory}` pushed into `unlockedAchievements`. `main.js#announceAchievements()` then shows "✨成就解锁✨\n[name]\n[desc]" + `pet.celebrate()` per entry, appending "🎨 新皮肤…" / "👗 新配饰…" lines when present. Threshold checks are a single data-driven `conditions` loop in the action handler, not inline blocks.

### Skin & Accessory System (成就解锁外观)
Each achievement unlocks a tint-based skin and/or a vector-drawn accessory — **zero new art** (see design doc §2.2 / §8). State persisted per-pet:
- Skins: `activeSkin` (equipped key) + `unlockedSkins` (starts `['default']`). 16 skins.
- Accessories: `equippedAccessories` ({slot:key}, multi-slot) + `unlockedAccessories` (array). 9 accessories across 4 slots (`ACC_SLOTS = head/body/feet/back`); same-slot items are mutually exclusive, cross-slot stack.
- `store.js`: `unlockSkin`/`setActiveSkin`, `unlockAccessory`/`setAccessory(slot,key)` (equip funcs only succeed if already unlocked). `reconcileUnlocks()` on `init()` backfills both from already-true achievements (old saves).
- **Rendering** (`Pet.js`): `skinTint` is the **base** color; state/mood tints (sleep `0x9aa4c8`, hungry `0xB8C0B0`, low-mood `0xC8C8D8`) are **multiplied on top** via `blendTint()` and the `_tint()`/`setSkin()` pair. All `sprite.tint` writes go through these; never set `sprite.tint` directly. Accessories are vector shapes from the `ACC_DRAW` map drawn into two layers above the sprite (see `Pet.js` bullet); to add an accessory you add a catalog entry **and** an `ACC_DRAW[key]` draw function.
- **UI**: `ui/AchievementPanel.js` — "🏆 成就 & 形象" panel (progress counter + skin grid + per-slot accessory wardrobe + achievement wall). Reachable from the radial menu and tray. Equipping calls `api.setSkin`/`api.setAccessory` → `main.js` callbacks repaint the cat live.

### Decay & Reunion System
- **Decay floor**: `FLOOR.hunger = 15`, `FLOOR.mood = 20` enforced in `ipc.js` decay loop
- **Reunion bonus**: absence ≥2 hours triggers mood recovery 6-12 points (longer absence = more recovery) in `main.js` boot
- **Farewell**: 10 min idle triggers farewell message once per session

### State-driven Appearance
`Pet.applyMood(pet)` in `Pet.js` (tints layered **over** the active skin via `blendTint`, not replacing it):
- `hunger < 20`: gray-green tint `0xB8C0B0`, breathing amplitude 0.8 (萎靡)
- `mood < 25`: gray tint `0xC8C8D8`, breathing amplitude 0.8 (低落)
- `mood > 70`: normal tint, breathing amplitude 2.2 (活泼)

⚠️ **`tint` is multiplicative** — it can only darken/shift hue, never brighten. Light skins (奶盐白/樱花粉/薄荷绿) only look right if the base sprite is bright enough; if they read as muddy gray, those skins need redrawn sprites (design doc §2.2 🔴 path), not a tint tweak.

## Design docs

`docs/` holds product/design specs (read `docs/README.md` first — it's the index). Key documents:
- **`docs/小团子-形象与功能设计.md`** — 形象/皮肤/配饰/待机动作/功能路线图。**§8「已落地实现」** documents the shipped skin/accessory/achievement/radial-menu systems — keep it in sync when changing those.
- **`docs/P0实施完成报告.md`** — P0心理学优化（人设一致性、饥饿唠叨、衰减保护、重逢补偿、告别欢迎、状态外显、升级峰值）已全部实施
- **`docs/上瘾机制优化报告.md`** — 变量奖励、连击系统、参与式游戏、成就收集的完整设计与实施文档
- **`docs/小团子-P0落地实施手册.md`** — 原始设计方案（proposals）

New persisted fields must be added to `DEFAULT_DATA` in `constants.js` so `store.js`'s deep-merge keeps old saves compatible.

## Assets

Cat sprites are **CC0** (OpenGameArt, Shepardskin) — see `CREDITS.md`. Originals were GIFs, converted to transparent PNG sheets by color-keying RGB(164,117,160). `pixi.min.js` is vendored at `assets/vendor/`. **Sprite facing**: 精灵图默认朝左，向右移动时需翻转（`scale.x` 为负）。
