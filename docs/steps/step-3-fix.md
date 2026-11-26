# 第 3 步补丁（3a-fix）：不要把"用户正在输入"当成回复

> 给 Muse 的任务指令。**在现有分支 `muse/step-3` 上追加提交，更新现有的 PR #3，不要新开分支，不要新开 PR。**
> 开始前先读 `README.md`、`docs/PLAN.md`、`docs/steps/step-3.md`。

## 背景（真实测试发现的问题）

用户实测第 3 步：在左边页面（claude.ai）的输入框里**打字**，红框就跑到了左边来。用户要的是：**红框只跟着"AI 给出了最新回复"走，不跟着"用户在哪边输入"走。**

当前过滤只排除了目标节点在 `textarea` / `input` / `[contenteditable]` 内部的变化。但用户打字时，页面输入框**周围**的界面（预览、计数、按钮、建议面板等）也会变化，这些变化落在可编辑区域之外，仍被计入突发。

## 只改这些文件

1. `manifest.json`：只把 `version` 改为 `"0.3.1"`，其他不动
2. `src/content.js`

不要创建别的文件，不要改 `README.md` 或 `docs/`。

## src/content.js 要求

保留现有的全部功能，新增 / 修改如下。

### 1. 用户输入抑制（核心修复）

- 在文件顶部的可调参数区新增：`USER_ACTIVITY_GRACE_MS = 1500`（带注释：用户在输入框里输入后，这段时间内页面的变化一律忽略）。
- 新增变量 `lastUserActivityAt`（`performance.now()` 的时间戳，初始为一个很早的值，例如 `-Infinity`）。
- 在 `document` 上用**捕获阶段**监听以下事件，且**仅当 `event.target` 在可编辑区域内**（复用 `isInEditable`）时，才更新 `lastUserActivityAt`：
  `beforeinput`、`input`、`compositionstart`、`compositionupdate`、`compositionend`、`paste`、`cut`
  - **不要监听 `keydown`**：按 Enter 发送消息时页面通常会阻止默认行为，不应当把"发送"当成"正在输入"而吞掉随后的回复。
  - 监听器必须是被动的（`{ capture: true, passive: true }`），不得阻止、修改事件。
- 在 `onMutations` 里，**先**判断 `performance.now() - lastUserActivityAt < USER_ACTIVITY_GRACE_MS`：
  - 如果成立：本批记录全部忽略；并且如果当前有进行中的突发（`burstStart !== null`），则调用 `resetBurst()` 丢弃它，并输出一行调试日志 `[Relay] burst discarded (user typing)`（只含这句话和数字，不含任何页面文字）。
  - 注意：这一行判断和原有的保护期（`graceUntil`）判断并列，任一成立都忽略。

### 2. 修正可编辑区域选择器

`isInEditable` 里的选择器由 `textarea, input, [contenteditable]` 改为
`textarea, input, [contenteditable]:not([contenteditable="false"])`
（避免把被明确标为 `contenteditable="false"` 的回复区也当成输入框过滤掉）。

### 3. 更有用的调试日志（只含页面结构，绝不含文字内容）

- 突发期间，对每条被计入的记录，统计其目标元素的"签名"出现次数，放进一个 `Map`（键数量上限 50，超过后新的签名不再加入）。目标是文本节点时取其父元素。
- 签名由以下部分拼成，**每一部分截断到 40 个字符**：
  - 元素的 `tagName` 小写；
  - 如果有 `role` 属性，加 `[role=…]`；
  - 如果有 `data-testid` 属性，加 `[testid=…]`；
  - 再加上向上最多 3 层祖先的 `tagName`，用 `<` 连接，例如 `div[testid=x]<div<main<body`。
- **不得**包含：任何文字内容、`class`、`id`、`aria-label`、`href`、`value` 等可能带有用户内容的值。
- 在原有的 `[Relay] burst ended` 日志里新增字段 `topTargets`：出现次数最多的前 3 个签名及其次数（数组）。其余字段保持不变。
- 每次突发结束后清空这个 `Map`。

### 4. 失联后自己清理红框

扩展被重新加载后，旧页面里的脚本会失联（`chrome.runtime.id` 为空），但页面里已有的红框会一直残留。修改 `stopDetector`：
- 除了原有的断开观察器、清除定时器之外，**再把红框隐藏并把宿主元素从页面移除**（`border.style.display = "none"; host.remove();`，包在 `try/catch` 里）。
- 确认 `hrefTimer`（每秒检查一次）在失联后能触发 `stopDetector`，这样旧页面里的红框会在约 1 秒内自行消失。
- 如果 `stopDetector` 的定义位置在红框变量之前导致无法引用，请调整代码顺序，不要用全局变量绕过。

### 5. 仍然禁止

`eval`、远程脚本、`innerHTML` 拼接、读取或保存页面文字内容、第三方库、新增权限、新增站点、站点专用选择器。

## 验收标准（Muse 用 DOM 桩 / 虚拟时钟自测）

- [ ] `manifest.json` 合法，`version` 为 `0.3.1`，权限和站点不变
- [ ] 模拟"在 contenteditable 里持续输入（触发 `beforeinput`/`input`），同时输入框之外的兄弟元素在被反复更新（模拟预览/计数）"：**不判定**
- [ ] 模拟"没有任何输入事件，页面持续追加文字约 5 秒后静止"：**判定为完成**并写入
- [ ] 模拟"回复流式输出中途，用户开始在输入框打字"：进行中的突发被丢弃，输出 `burst discarded` 日志，不判定
- [ ] 模拟"停止输入超过 1.5 秒后，回复继续流式输出且达到阈值"：可以判定
- [ ] 模拟"`keydown` Enter 但没有 input 事件"：**不会**更新 `lastUserActivityAt`
- [ ] 模拟"目标在 `contenteditable="false"` 的区域里持续追加文字"：不被当作输入框过滤，可以判定
- [ ] `[Relay] burst ended` 日志包含 `topTargets`，且断言其中**不含**测试里放入的任何页面文字、`class`、`id`
- [ ] 模拟扩展失联（把 `chrome.runtime.id` 清空）：约 1 秒内红框被隐藏、宿主元素被移除、观察器断开、不报错
- [ ] 原有的快捷键切换、跨页面同步功能不受影响
- [ ] 凡是无法在真实 Chrome 里验证的，请如实标为"未验证"

## Git 步骤

1. 切换到现有分支 `muse/step-3`，先拉取最新，确认头部是 `b6dce2062caa3c9d576d232bda62980e1f39e3ec`
2. 追加**一个**新提交（英文一句话），推送到 `muse/step-3`
3. PR #3 会自动更新；**不要新开 PR，不要合并**

## 报告格式

- 分支名、新提交 SHA
- 修改的文件清单，每个一句话
- 对照"验收标准"逐条回答：已验证 / 未验证（以及为什么）
- 新增参数 `USER_ACTIVITY_GRACE_MS` 的值
- 没做的事、不确定的地方、偏离指令的地方
- 确认 PR #3 已显示新提交
