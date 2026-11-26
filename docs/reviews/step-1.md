# 第 1 步审查记录

- 审查对象：PR #1，分支 `muse/step-1`，提交 `cc553c983ca3bed6a3cf5a32da5874dc615b69d5`
- 审查者：Claude
- 结论：**代码审查通过，可以合并；合并前需要用户在真实 Chrome 里完成手动验证**

## 对照清单

| 项目 | 结果 |
|---|---|
| manifest 为合法 MV3 | 通过 |
| 无 `permissions`、无 background | 通过 |
| 站点匹配最小（仅 muse.ai 与 chatgpt.com） | 通过 |
| 无 `all_frames` | 通过 |
| 无 eval / 远程脚本 / innerHTML / 第三方库 | 通过 |
| 不读取、不保存页面内容 | 通过 |
| 防重复注入 | 通过 |
| 红框 `pointer-events: none`、`position: fixed`、最高 z-index | 通过 |
| 快捷键用 `event.code`，并 `preventDefault()` | 通过 |
| 宿主 div 额外加 `pointer-events: none` | 可以，属于合理的额外保险 |

## 需要用户手动验证（Muse 无法验证）

1. 在 `chrome://extensions` 加载仓库根目录（切到 `muse/step-1` 分支的代码）。
2. 在 muse.ai 和 chatgpt.com 各按一次 `Alt+Shift+R`：红框出现，再按一次消失。
3. 红框出现时，页面仍能点击、输入、滚动。
4. 焦点在输入框里时，快捷键是否仍然生效（见下面第 1 条改进）。

## 非阻塞的改进，留到第 2 步一起做

1. **监听改用捕获阶段**：`document.addEventListener("keydown", handler, true)`。有的站点会在输入框里拦截键盘事件并停止冒泡，冒泡阶段可能收不到。
2. **忽略长按重复**：在处理函数开头加 `if (event.repeat) return;`，否则按住按键会让红框快速闪烁。

## 已知限制（不是缺陷，仅记录）

- 页面进入全屏模式（视频等使用浏览器顶层）时，红框可能被盖住。
- 页面里的 iframe 不会显示红框（本步不开 `all_frames`）。
- 扩展重新加载后，已打开的页面需要刷新才会重新注入。
