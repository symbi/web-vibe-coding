# Relay Highlighter

一个 Chrome 插件（Manifest V3）：当你同时在左右两个窗口使用两个 AI（例如 Muse 和 ChatGPT / Claude Code / Codex）时，**哪一侧刚刚产出了最新回复，哪一侧的整个网页就显示红框**，提醒你"最新结果在这一边，把它复制到另一边"。

## 先读这些

- 完整计划、技术决策、分步任务、协作规则：[`docs/PLAN.md`](docs/PLAN.md)
- 每一步的具体指令：[`docs/steps/`](docs/steps/)

任何新的 agent（Muse、Claude、Claude Code、Codex 等）或新窗口接手时，**先读 `docs/PLAN.md` 的"状态日志"和"协作协议"**，再开始工作。

## 本地加载（测试用）

1. 打开 `chrome://extensions`
2. 开启右上角"开发者模式"
3. 点"加载已解压的扩展程序"，选择本仓库的根目录
4. 修改代码后，在该页面点插件卡片上的刷新按钮，再刷新目标网页
