# 第 1 步：骨架与红框

> 给 Muse 的任务指令。分支名：`muse/step-1`。
> 开始前先读 `README.md` 和 `docs/PLAN.md`（重点读"技术决策"和"协作协议"）。

## 目标

做出一个能在 Chrome 里加载的最小 Manifest V3 扩展：在指定网站的页面上，按快捷键可以切换一圈覆盖整个网页的红框。**这一步不做任何"检测回复"或"跨页面同步"的逻辑。**

## 要创建的文件（只改这些）

1. `manifest.json`
2. `src/content.js`

不要创建别的文件，不要改 `README.md` 或 `docs/`。

## manifest.json 要求

- `manifest_version`: 3
- `name`: "Relay Highlighter"，`version`: "0.1.0"，加一句简短 `description`
- **不要声明任何 `permissions`**（这一步不需要）
- **不要使用 background / service worker**
- `content_scripts`：
  - `matches` 只包含：`https://muse.ai/*`、`https://*.muse.ai/*`、`https://chatgpt.com/*`
  - `js`: `["src/content.js"]`
  - `run_at`: `document_idle`
  - 不要开 `all_frames`

## src/content.js 要求

1. **防重复注入**：用一个标志（例如挂在 `document.documentElement` 的 `dataset`）判断，已注入则直接返回。
2. **红框元素**：创建一个宿主 `<div>`，附加到 `document.documentElement`，在它的 **Shadow DOM** 内放一个红框元素：
   - `position: fixed; inset: 0;`
   - `border: 6px solid #e5262b; box-sizing: border-box;`
   - `pointer-events: none;`（**绝对不能挡住页面点击和滚动**）
   - `z-index: 2147483647;`
   - 默认隐藏
3. **切换快捷键**：监听 `keydown`，当 `event.altKey && event.shiftKey && event.code === "KeyR"` 时切换红框的显示/隐藏。必须用 `event.code`（不要用 `event.key`，因为 macOS 上 Option 组合键会产生特殊字符）。触发时调用 `event.preventDefault()`。
4. 不使用 `eval`、不加载任何远程脚本、不使用 `innerHTML` 拼接动态内容、不读取或保存页面内容。
5. 代码简短、有清晰注释，用 `const`/`let`，不引入任何第三方库。

## 验收标准（你自己先对照）

- [ ] `manifest.json` 是合法 JSON，且是 MV3
- [ ] 没有 `permissions`，没有 background
- [ ] 在 `chrome://extensions` 开发者模式下可以"加载已解压的扩展程序"（选仓库根目录）
- [ ] 打开 muse.ai 或 chatgpt.com，按 `Alt+Shift+R`，整个页面出现红框；再按一次消失
- [ ] 红框出现时，页面仍然可以正常点击、输入、滚动

## Git 步骤

1. 从 `main` 创建分支 `muse/step-1`
2. 提交上述两个文件（提交信息用英文）
3. 推送分支，并开一个 **Draft PR** 指向 `main`
4. **不要合并，不要标记为 Ready**

## 报告格式（完成后回复我）

- 分支名与最新提交 SHA
- 创建/修改的文件清单，每个一句话说明
- 对照"验收标准"逐条回答：已验证 / 未验证（以及为什么）
- 你没有做的事、不确定的地方、任何偏离指令的地方
- PR 链接（如果无法创建 PR，请说明原因）
