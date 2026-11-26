# 第 2 步：跨页面同步

> 给 Muse 的任务指令。分支名：`muse/step-2`。
> **前提：PR #1（第 1 步）已合并到 `main`（2026-11-26）。** 必须从最新的 `main` 创建分支；如果 `main` 里没有 `manifest.json` 和 `src/content.js`，请停下并告诉用户。
> 开始前先读 `README.md`、`docs/PLAN.md`（重点是"状态模型"和"协作协议"）、`docs/reviews/step-1.md`。

## 目标

让多个页面共享"谁拥有最新结果"这个状态：在页面 A 里触发后，A 亮红框，其他页面自动熄灭。**这一步仍用快捷键手动触发，用来代替以后的"自动检测回复完成"。**

## 只改这些文件

1. `manifest.json`
2. `src/content.js`

不要创建别的文件，不要改 `README.md` 或 `docs/`。

## manifest.json 要求

- `version` 改为 `"0.2.0"`
- 新增 `"permissions": ["storage"]`，**不要加任何其他权限**
- `content_scripts.matches` 在原有三项基础上增加 `https://claude.ai/*`（共四项）
- 其余保持不变：不用 background / service worker，不开 `all_frames`

## src/content.js 要求

保留第 1 步已有的：防重复注入、Shadow DOM 红框（`position: fixed; inset: 0; border: 6px solid #e5262b; pointer-events: none; z-index: 2147483647`）。在此基础上：

1. **页面实例 ID**
   - 用 `crypto.randomUUID()` 生成，保存在 `sessionStorage` 的键 `relay.instanceId` 中，同一标签页刷新后保持不变。
   - 读写 `sessionStorage` 要用 `try/catch`；失败时退化为只存在内存中的随机 ID。

2. **共享状态**
   - 存在 `chrome.storage.local` 的键 `relay.latest`，值为 `{ "id": "<实例ID>", "site": "<location.hostname>", "ts": <Date.now()> }`。
   - **只存这三个字段，不存任何页面内容。**

3. **渲染规则**
   - `render(latest)`：当 `latest` 存在且 `latest.id` 等于自己的实例 ID 时显示红框，否则隐藏。
   - 页面加载时读取一次 `relay.latest` 并渲染（刷新后红框保持）。
   - 监听 `chrome.storage.onChanged`，当 `area === "local"` 且 `relay.latest` 变化时，用 `changes["relay.latest"].newValue` 重新渲染（`newValue` 为空表示已清除）。

4. **快捷键** `Option+Shift+R`（继续用 `event.code === "KeyR"` 判断 `altKey` 和 `shiftKey`）
   - **监听改为捕获阶段**：`document.addEventListener("keydown", handler, true)`（第 1 步审查的改进建议）。
   - **忽略长按重复**：处理函数开头 `if (event.repeat) return;`。
   - 行为：先读取当前 `relay.latest`；如果它的 `id` 等于自己，则清除（`chrome.storage.local.remove("relay.latest")`）；否则写入 `{id: 自己, site, ts}`。
   - 触发时调用 `event.preventDefault()`。

5. **健壮性**
   - 所有 `chrome.storage` 调用放在 `try/catch` 里，并处理异步回调中的 `chrome.runtime.lastError`。
   - 扩展被重新加载后，旧页面里的脚本会失效（`chrome.runtime.id` 为空）；此时应安静地停止，不要在控制台刷屏报错。

6. 仍然禁止：`eval`、远程脚本、`innerHTML` 拼接、读取或保存页面内容、第三方库。代码保持简短，带清晰注释。

## 验收标准

- [ ] `manifest.json` 合法 MV3，`permissions` 仅有 `storage`，`matches` 为四项
- [ ] 同时打开 muse.ai 与 chatgpt.com（或 claude.ai）两个页面，**都刷新过**
- [ ] 在页面 A 按 `Option+Shift+R`：A 亮红框，B 没有
- [ ] 再到页面 B 按 `Option+Shift+R`：B 亮红框，A **自动熄灭**
- [ ] 在 B 再按一次：B 熄灭，两边都没有红框
- [ ] A 亮红框时刷新 A：红框仍然在
- [ ] 光标在聊天输入框里时，快捷键仍然有效
- [ ] 按住快捷键不放，红框不会快速闪烁
- [ ] 在 `chrome://extensions` 的插件错误页面中没有新增报错
- [ ] `chrome.storage.local` 里只有 `relay.latest`，值里只有 `id`、`site`、`ts`

## Git 步骤

1. 确认 `main` 已包含第 1 步的代码，再从 `main` 创建分支 `muse/step-2`
2. 提交信息用英文，一句话
3. 推送后开一个**普通 PR（不是 Draft）**指向 `main`；**不要合并**。如果无法开 PR，只推送分支并说明原因

## 报告格式

- 分支名与最新提交 SHA
- 创建/修改的文件清单，每个一句话
- 对照"验收标准"逐条回答：已验证 / 未验证（以及为什么）
- 没做的事、不确定的地方、偏离指令的地方
- PR 链接（若无法创建，说明原因）
