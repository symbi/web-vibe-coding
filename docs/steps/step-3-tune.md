# 第 3 步调参（3a-tune）：放宽判定门槛，日志改为单行

> 给 Muse 的任务指令。**在现有分支 `muse/step-3` 上追加一个提交，更新现有的 PR #3，不要新开分支，不要新开 PR，不要合并。**
> 开始前先读 `README.md`、`docs/PLAN.md`、`docs/steps/step-3.md`、`docs/steps/step-3-fix.md`。

## 背景（真实数据）

用户在 chatgpt.com 上实测，从 `[Relay] burst ended` 日志得到：

| 类型 | durationMs | mutations | addedChars | 当前结果 |
|---|---|---|---|---|
| 真回复（含表格） | 8346 | 56 | 488 | 通过 |
| 真回复（用户反馈"没亮"的那次） | 4121 | **28** | 218 | **被拒（差 2 次变化）** |
| 短回复（"test"） | 1880 | 17 | 60 | 被拒 |
| 界面杂音（菜单、按钮等） | 0 到 877 | 1 到 12 | 0 到 27 | 被拒（正确） |

结论：门槛过严，尤其是 `MIN_MUTATIONS = 30`。杂音与真回复在"持续时间"和"新增字数"上分得很开。

## 只改这些文件

1. `manifest.json`：只把 `version` 改为 `"0.3.2"`
2. `src/content.js`

不要创建别的文件，不要改 `README.md` 或 `docs/`。

## 要求

### 1. 调整三个常量（其余参数不变）

| 常量 | 旧值 | 新值 |
|---|---|---|
| `MIN_BURST_MS` | 2000 | 1500 |
| `MIN_MUTATIONS` | 30 | 10 |
| `MIN_ADDED_CHARS` | 80 | 40 |

注释里简要写明依据：来自真实日志，杂音持续时间不超过约 900 毫秒、新增字数不超过约 30。

### 2. 日志改为单行字符串（方便用户直接复制）

把 `[Relay] burst ended` 这条日志，从"第二个参数是对象"改为**一整行字符串**，格式：

`[Relay] burst ended accepted=true durationMs=4121 mutations=28 addedChars=218 at=14:32:07 top=div<div<div<div:15|span<p<div<div:5|span<button<div<div:2`

- `durationMs` 取整数。
- `at` 是本地时间 `HH:MM:SS`（用 `new Date()` 格式化，不要输出日期以外的任何内容）。
- `top` 是 `topTargets` 里的签名和次数，用 `|` 连接；没有则写 `top=none`。签名里本身不含空格，不要加引号。
- `[Relay] burst discarded (user typing)` 那条也改成单行字符串，并带上 `at=HH:MM:SS`，例如：
  `[Relay] burst discarded (user typing) mutations=6 addedChars=12 at=14:32:09`
- 仍然**只含数字、时间和结构签名，绝不含页面文字**。

### 3. 仍然禁止

`eval`、远程脚本、`innerHTML` 拼接、读取或保存页面文字内容、第三方库、新增权限、新增站点、站点专用选择器。不要改动本任务书之外的行为。

## 验收标准（Muse 用 DOM 桩 / 虚拟时钟自测）

- [ ] `manifest.json` 合法，`version` 为 `0.3.2`，权限和站点不变
- [ ] 模拟"持续约 4 秒、28 次变化、218 字"：**判定为完成**并写入
- [ ] 模拟"持续约 1.9 秒、17 次变化、60 字"：**判定为完成**并写入
- [ ] 模拟"持续 0.9 秒、12 次变化、27 字"：**不判定**
- [ ] 模拟"持续 0.1 秒、6 次变化、0 字"：**不判定**
- [ ] 用户打字抑制、失联自清理、快捷键、跨页面同步等原有行为不变（回归通过）
- [ ] `burst ended` 和 `burst discarded` 日志是单行字符串，符合上面的格式；断言其中不含测试里放入的页面文字、`class`、`id`
- [ ] 凡是无法在真实 Chrome 里验证的，请如实标为"未验证"

## Git 步骤

1. 切换到现有分支 `muse/step-3`，先拉取最新，确认头部是 `93ca800a039a0fe861c83b04ae61f3712dcdde34`
2. 追加**一个**新提交（英文一句话），推送到 `muse/step-3`
3. PR #3 会自动更新；**不要新开 PR，不要合并**

## 报告格式

- 分支名、新提交 SHA
- 修改的文件清单，每个一句话
- 对照"验收标准"逐条回答：已验证 / 未验证（以及为什么）
- 三个新常量的值
- 没做的事、不确定的地方、偏离指令的地方
- 确认 PR #3 已显示新提交
