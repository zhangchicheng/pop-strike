# Pop Strike: itch.io 发布

## 上传文件

执行 `python3 scripts/build_release.py` 生成：

| 文件 | 用途 |
| --- | --- |
| `dist/pop-strike-itch-en.zip` | 英文 HTML5 单人生存，上传后在浏览器中游玩 |
| `dist/pop-strike-lan-en.zip` | 英文单人和局域网下载版，房主启动 Node 服务 |

网页版 ZIP 根目录就是 `index.html`，不要再次套一层目录或重新压缩整个项目。菜单、六种武器、操作指南、死亡与结算界面均为英文；局域网包也包含英文服务器提示、队伍消息和记分板。游戏内字体、Three.js 及授权文本都已包含。测试文件、历史截图、参考图片和开发工具不会进入发布包。

## itch.io 页面设置

1. 新建项目，标题填 **Pop Strike**，类型选择 **HTML Game**。
2. 上传 `pop-strike-itch-en.zip`，标记为在浏览器中运行的文件。需要提供联机版时，再上传 `pop-strike-lan-en.zip` 作为普通下载，不选为浏览器文件。
3. 嵌入尺寸可用 **1280 × 800**，页面空间较小时用 **960 × 600**。开启 **Click to Play**。游戏内 **F** 键可进入只包含战场和 HUD 的全屏。
4. 初次发布建议面向桌面键鼠玩家；现有触屏按钮可以保留，但仅做了窄屏布局检查，未完成真实手机浏览器验证，暂不勾选 Mobile Friendly。
5. 上传英文截图，可使用 `docs/images/lobby.png`、`docs/images/gameplay.png` 和 `docs/images/sniper-scope.jpg`。`docs/images/lan-respawn.png` 属于下载版的联机画面，说明中标明这一点。这些图片随源码保存，不依赖本地生成的 `dist/` 目录。
6. 在草稿预览中实际进入游戏，确认声音、鼠标锁定与 F 全屏后，再将项目可见性设为公开。本地构建不会自动上传或公开项目。

官方说明：[HTML5 上传、相对路径、嵌入尺寸与限制](https://itch.io/docs/creators/html5)、[创建游戏页面](https://itch.io/docs/creators/getting-started)。

itch.io 的浏览器版本运行上传的静态 HTML / JavaScript。现有联机实现需要常驻的 Node / WebSocket 房主服务，因此不能仅靠上传网页 ZIP 提供联机。下载版继续支持同一局域网的 2–8 人对战；如果以后需要跨网络匹配，需另行部署 HTTPS / WSS 服务并调整连接方式。

## 可直接使用的英文介绍

**Short description**

A colorful comic-book FPS. Six weapons, three waves, and a yard full of ways to get the drop on your enemies.

**Description**

Welcome to **Pop Strike**. Step into a comic-book battleground, climb stacked cargo, cross upper walkways, and make every shot pop.

- **Solo Survival:** clear three enemy waves in three minutes. Chain eliminations, land headshots, and beat your best score.
- **Six distinct weapons:** Pop Rifle, Pump Shotgun, Swift SMG, Scout Sniper, Hand Cannon, and Sixshot Revolver.
- **Take the high ground:** enter buildings, climb ladders, mantle crates, and fight across rooftops and catwalks.
- **Comic-book style:** chunky outlines, a warm retro palette, colorful headbands, and animated falls.
- **LAN Battle — separate download:** host 2–8 players on your local network. Red vs. blue, first team to 20 kills, and quick respawns. The browser version is solo only.

**Controls**

WASD to move · Mouse to look · Left click to fire · Right click to aim / use the sniper scope · R to reload · 1–6 or mouse wheel to switch weapons · Shift to sprint · Space to jump (hold to mantle) · E to grab ladders · W/S to climb · Esc to pause / release the cursor · F for fullscreen · M to mute. Hold Tab for the scoreboard in LAN Battle.

Desktop keyboard and mouse recommended. Requires a browser with WebGL 2 support. To host LAN Battle, install Node.js 22 or newer; guests only need a browser.

**Make it pop.**
