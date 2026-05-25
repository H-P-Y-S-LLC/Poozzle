# POOZZLE 官网 — 美术资产对照表

> **使用方法**：将每项资产的网络地址填入「替换地址」列，发给 Copilot 即可一键对号入座。

---

## 🖼️ Logo

| 变量名         | 当前路径（代码中）             | 替换地址   | 尺寸规格                     | AI 提示词                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------ | ---------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logo-poozzle` | `assets/logo/logo-poozzle.png` | _(待填写)_ | **800×500 px**，透明背景 PNG | Extract the "POOZZLE" game logo from the design mockup. The logo features large yellow/golden bubbly letters dripping with slime, cartoon eyes embedded in the letters, small poop emoji on top, sparkle effects, white highlight glints. Transparent background PNG, no shadow baked in. |

---

## 🏠 背景 & 纹理

| 变量名               | 当前路径（代码中）     | 替换地址     | 尺寸规格                   | 说明 / AI 提示词                                                                                                                                                                     |
| -------------------- | ---------------------- | ------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bg-bathroom-tiles`  | _(CSS 自绘，无需文件)_ | _(可选升级)_ | **400×400 px**，可平铺 PNG | A seamless tileable green bathroom tile texture, vintage/retro style, slightly grimy grout lines, muted olive-green ceramic tiles, each tile ~80px with 2px dark grout.              |
| `bg-pipes-overlay`   | _(CSS 自绘，无需文件)_ | _(可选升级)_ | **与容器等宽**，透明 PNG   | Rusty steampunk copper/brass pipes overlay decoration. Various horizontal and vertical pipes with flanged joints, valve wheels, bolts. Transparent background, no fill behind pipes. |
| `bg-night-dungeon`   | _(CSS 渐变，无需文件)_ | _(可选升级)_ | **1024×600 px** JPG        | Dark dungeon/sewer night sky background for Bug Dossiers section. Purple-dark atmosphere, faint distant castle silhouette, bats, muted purple-orange gradient sky. No UI elements.   |
| `texture-wood-panel` | _(CSS 实现，无需文件)_ | _(可选升级)_ | **200×200 px**，可平铺 PNG | Dark walnut wood panel texture, horizontal grain, vintage game UI style, slightly warm brown tones. Seamless tile.                                                                   |

---

## 🚽 场景道具 (Props)

| 变量名         | 当前路径（代码中）              | 替换地址   | 尺寸规格                 | AI 提示词                                                                                                                                                                                  |
| -------------- | ------------------------------- | ---------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prop-toilet`  | `assets/props/prop-toilet.png`  | _(待填写)_ | **200×280 px**，透明 PNG | Extract the cartoon toilet from the left side of the POOZZLE mockup. White porcelain toilet, slightly dirty/stained, cartoon style, viewed from a 3/4 front angle. Transparent background. |
| `prop-plunger` | `assets/props/prop-plunger.png` | _(待填写)_ | **120×200 px**，透明 PNG | Extract the brown wooden plunger (toilet plunger) prop from the POOZZLE mockup. Cartoon style, wooden handle with red rubber cup at bottom. Transparent background PNG.                    |
| `prop-pipe-h`  | `assets/props/prop-pipe-h.png`  | _(可选)_   | **200×50 px**，透明 PNG  | A single horizontal steampunk copper/brass pipe segment with flanged ends and bolt details. Cartoon game art style. Transparent background.                                                |
| `prop-pipe-v`  | `assets/props/prop-pipe-v.png`  | _(可选)_   | **50×200 px**，透明 PNG  | A single vertical steampunk copper/brass pipe segment with flanged ends. Cartoon game art style. Transparent background.                                                                   |
| `prop-gear`    | `assets/props/prop-gear.png`    | _(可选)_   | **128×128 px**，透明 PNG | A steampunk cogwheel/gear, brass/golden color, 8 teeth, cartoon game art style. Transparent background PNG. Will be CSS-rotated.                                                           |

---

## 🎮 游戏 UI

| 变量名                | 当前路径（代码中）                  | 替换地址     | 尺寸规格                 | AI 提示词                                                                                                                                                                                                                                     |
| --------------------- | ----------------------------------- | ------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gameplay-screenshot` | `assets/ui/gameplay-screenshot.png` | _(待填写)_   | **560×440 px** PNG       | Extract the match-3 game board screenshot from the POOZZLE mockup. Shows a 7×5 grid of poop/toilet paper/water drop tiles on a light wooden board background, with a "Combo!" text overlay visible. Crop tightly to the game board area only. |
| `ui-gameboard-frame`  | _(CSS 实现，无需文件)_              | _(可选升级)_ | **640×500 px**，透明 PNG | A decorative wooden frame/border for a game board. Dark walnut wood, carved edges, metal corner reinforcements, steampunk style. Hollow center (transparent).                                                                                 |
| `ui-hud-panel`        | _(CSS 实现，无需文件)_              | _(可选升级)_ | **480×80 px**，透明 PNG  | A game HUD panel background strip, translucent white/cream frosted glass style with rounded corners and subtle border. For overlaying Score/Moves/Goal text.                                                                                  |
| `icon-poop`           | _(emoji 替代，可选)_                | _(可选)_     | **64×64 px**，透明 PNG   | A cute cartoon poop emoji icon, golden-brown swirl shape with cartoon eyes and smile, glossy highlight. Transparent background. Match POOZZLE art style.                                                                                      |
| `icon-toilet-paper`   | _(emoji 替代，可选)_                | _(可选)_     | **64×64 px**，透明 PNG   | A cute cartoon toilet paper roll icon, white roll with visible sheet layers, cartoon eyes. Transparent background. Match POOZZLE art style.                                                                                                   |

---

## 🐛 Bug 角色

| 变量名                 | 当前路径（代码中）                     | 替换地址   | 尺寸规格                 | AI 提示词                                                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------- | ---------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bug-flying-shadow`    | `assets/bugs/bug-flying-shadow.png`    | _(待填写)_ | **300×300 px**，透明 PNG | Extract "THE FLYING SHADOW" bug character from the POOZZLE mockup — a large cartoon fly/mosquito-like creature with large compound eyes, segmented body, detailed wings spread wide, dark coloring. Full body visible, transparent background PNG. |
| `bug-overstep-crawler` | `assets/bugs/bug-overstep-crawler.png` | _(待填写)_ | **300×300 px**，透明 PNG | Extract "THE OVERSTEP CRAWLER / 美洲大蠊" bug character from the POOZZLE mockup — a large cartoon American cockroach/palmetto bug, reddish-brown, many legs, antennae, cartoon eyes, menacing expression. Transparent background PNG.              |
| `bug-invisible-mildew` | `assets/bugs/bug-invisible-mildew.png` | _(待填写)_ | **300×300 px**，透明 PNG | Extract "INVISIBLE MILDEW / 霉面怪" character from the POOZZLE mockup — a blob/slime creature made of green mold/mildew, amorphous shape, cartoon eyes, dripping green slime. Transparent background PNG.                                          |

---

## 📱 下载徽章

| 变量名             | 当前路径（代码中）                   | 替换地址   | 尺寸规格                  | 说明                                                                               |
| ------------------ | ------------------------------------ | ---------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `badge-appstore`   | `assets/badges/badge-appstore.png`   | _(待填写)_ | **标准 App Store 徽章**   | 直接从 Apple 官方下载：https://developer.apple.com/app-store/marketing/guidelines/ |
| `badge-googleplay` | `assets/badges/badge-googleplay.png` | _(待填写)_ | **标准 Google Play 徽章** | 直接从 Google 官方下载：https://play.google.com/intl/en_us/badges/                 |

---

## 🔤 字体

| 字体名      | 来源                         | 说明                  |
| ----------- | ---------------------------- | --------------------- |
| Bangers     | Google Fonts (已通过CDN加载) | 导航栏、标题、CTA按钮 |
| Fredoka One | Google Fonts (已通过CDN加载) | 副标题、按钮          |
| Nunito      | Google Fonts (已通过CDN加载) | 正文、说明文字        |

> 无需下载字体文件，已通过 CDN 自动加载。

---

## ✅ 填写完后告诉 Copilot 的格式

```
请把以下资产地址填入代码：
- logo-poozzle: https://example.com/logo.png
- prop-toilet: https://example.com/toilet.png
- gameplay-screenshot: https://example.com/gameplay.png
- bug-flying-shadow: https://example.com/bug1.png
- bug-overstep-crawler: https://example.com/bug2.png
- bug-invisible-mildew: https://example.com/bug3.png
- badge-appstore: https://example.com/appstore.png
- badge-googleplay: https://example.com/googleplay.png
```

---

_P0 必填（核心体验）：logo-poozzle、gameplay-screenshot、3个bug角色_
_P1 建议填（完整体验）：prop-toilet、prop-plunger、两个store徽章_
_P2 可选（精细化）：bg-bathroom-tiles、bg-pipes-overlay、各种icon_
