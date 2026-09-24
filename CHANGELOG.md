# CHANGELOG

## v0.2.5 (2026-09-24)

- chore（工程化规范化，无运行时改动，npm 包内容不变）：
  - 补建 `src/` 目录：此前仓库**完全没有** `src/`，现以 `lib/` 为准建立同源镜像，`index.js` / `client.js` 与 `lib/` 逐字节一致。
  - `build.ps1` 升级为统一模板（此前只做 `npm pack`）：以 `lib/` 为准校验并同步 `src/`；`-NoSync` 只校验、发现漂移即报错退出；**只清理「当前版本」的同名 tgz**，历史版本一律保留 —— profile 的 `file:` 依赖可能正指向旧版本文件。
  - 新增 CI（`.github/workflows/ci.yml`，此前**没有** `.github/`）：`lib/` 产物存在性 + `src/` ↔ `lib/` 逐字节一致性门禁 + 单元测试步骤（无测试文件时自动跳过）；新增 `publish.yml`（release 触发的 npm 官方源发布）。
  - 补充 `CLAUDE.md`（此前缺失）与 `.gitignore` 的 `CLAUDE.md` 忽略规则。

## v0.2.4 (2026-09-11)

- fix: 运行出错通知失效——旧实现尝试从 `binding.session.getSnapshot().nodes` 读取 `turn-error` 节点，但 session snapshot 实际不包含 `nodes` 字段，导致永远检测不到错误，所有会话结束都发「任务完成」通知（包括 429 限流、认证失败等错误场景）。
- fix: 改用 `binding.session.getSnapshot().lastAgentError` 字段检测 session 级别的错误，现在 429 限流、API 错误等能正确触发「运行出错」通知。
- refactor: 新增 `getLastTurnEnd()` 函数统一获取 turn 结束信息，`lastTurnError()` 和 `fireCompletionNotice()` 均使用此函数。
- refactor: `lastAssistantText()` 暂时返回空字符串（当前 session snapshot 不包含聊天节点），未来可通过 projection 系统访问 `assistant-step` 节点时再实现。
- note: 当前仍无法区分「用户主动中断」和「正常完成」，因为 session snapshot 不包含 turn 结束原因的详细信息（`interrupted` / `aborted` 等）。未来可通过 projection 系统或事件窗口访问 `turn/end` 事件时再细化。

## v0.2.3 (2026-09-08)
 (2026-09-08)

- chore: package.json 新增 `engines.dsh: ">=0.1.2-alpha.4"`，供 dsh-market 展示宿主版本要求并参与兼容性过滤；无功能改动。

## v0.2.2 (2026-09-04)

- fix: 主会话派出后台子代理（或后台任务未跑完）时误报「任务完成」。根因：完成判定只看会话列表里 `running true->false` 边沿，而 agent 把活交给后台子代理后会**让出回合**等结果投递，此时 agent 驱动确实停了，会话却远没结束，于是弹出完成通知（还会连着弹子代理一条）。
- fix: 完成判定加两道闸（`waitForBackground`，默认开）：① `hasLiveBackgroundWork` —— 从会话列表快照自带的 `byId`(parentId/running) / `subagentsByParent`(activity running) / `jobsBySession` 三个映射递归判断该会话是否仍有在跑的子代理（含孙代理等更深层级）或未结束的**代理类**后台任务（kind ∈ subagent|agent|workflow|ralph|goal），有则挂起不通知，等工作全部结束后补判一次；② `DONE_GRACE_MS` 1.2s 宽限期 —— 到点重读快照，期间会话被结果唤醒重新 running 或又派了新活就不发（顺带躲开状态帧到达顺序造成的瞬时误报）。
- design: 后台 shell 任务（`pwsh` / `bash` run_in_background，含常驻 dev server）**不参与**压制定通知的判定 —— 这类任务可能一直 running，用它压通知会把「任务完成」永久吞掉；代理类任务跑完必结束，所以可以放心挂起。
- feat: 设置页新增「等子代理 / 工作流时不通知」开关（关掉即恢复旧行为）；「任务完成」与「运行出错」两类通知共用这套判定。
- chore: 调试钩子新增 `window.__dshNotifyXc.probe(sessionId)`，直接看某会话是否被判为「仍在等后台工作 / 已挂起 / 有未发出的定时器」，便于排查「为什么没弹通知」。

## v0.2.1 (2026-09-03)

- fix: 移动端权限误报「已拒绝」——iOS 16.4+ 普通 Safari/Chrome 标签页中 Notification API 虽存在但永远无法授权，Android WebView / 微信、QQ、钉钉、飞书等 App 内置浏览器通知权限被宿主强制禁用；旧实现只按 `'Notification' in window` 判断，这些环境会误显示「已拒绝」及桌面端无用指引。
- fix: 补全移动端能力检测——iOS 的系统通知仅有 Service Worker Web Push 一条路（需 HTTPS + 添加到主屏幕 + 网站注册 SW），本插件基于本地 new Notification() 未接入该机制，iOS 上一律弹不出；WebView / 微信、QQ 等内置浏览器同样不支持。全部按「不支持」置灰设置页并按环境分场景提示，不再误导用户去处理「已拒绝」。
- ui: 「权限被拒绝」指引改为跨浏览器通用文案（不再只有 Chrome 地址栏操作）。

## v0.2.0 (2026-09-02)

- feat: 新增「运行出错通知」——会话本轮以 turn-error 结束时弹通知，与任务完成互斥；工具级失败/用户中断不通知。
- feat: 通知类型可配置——任务完成 / 需要输入 / 运行出错 三类各自独立开关，共享发送模式。
- feat: 需要输入通知常驻（requireInteraction，可配置），通知带 DSH 官方图标（/favicon.svg）。
- feat: 通知显示工作区归属（[工作区名] 前缀，可配置）。
- feat: 移动浏览器不支持 Notification API 时，设置页置灰并提示不支持。
- chore: 设置模型升级 v2（v1 自动迁移）；移除 BUNDLE_VERSION。
- ui: 测试按钮移至标题栏右对齐；移除设置页底部摘要行。

## v0.1.1 (2026-09-02)

- docs: README 中英双份重写，对齐 xc 系列插件文档风格（徽章、核心特性、安装、配置、使用、兼容性章节）。

## v0.1.0 (2026-09-?)

- 全新插件：基于 dsh-agent-notify 1.0.0 面向新版 DSH（0.1.2-alpha.4）的兼容性重写。
- 修复 dsh-agent-notify 在新版 DSH 启动报错：
  - 移除不存在的 `@deepseek-ai/dsh-client-runtime` require 与其 inject 声明（bundle 物化时 require 命中模块表 throw 是启动失败的根因）。
  - `dsh.client.inject` 改为新版实际存在的 client bundle（dsh-client-connection / dsh-client-ui-slots / dsh-client-ui-session / dsh-api-session-controller）。
- 适配新版数据层：
  - 待处理交互改读 `ctx.uiSession.pendingInteractions`（Map store，kind ∈ approval|question|plan-review），替代已移除的 `summary.pendingInteraction`。
  - 设置页注册改为 `ctx.slots.inject("settings.section", ...)` 包裹，对齐新版 slot 契约（id/order/label）。
- 保留 dsh-agent-notify 全部行为：任务完成/需要输入系统通知、三种发送模式、子代理过滤、点击直达会话、自动授权、测试按钮、localStorage 设置、防误报基线。
- 目录结构与代码风格对齐 dsh-session-xc：package.json manifest（dsh.bundle.patch + dsh.client）、cordis.patch.yml、build.ps1、双语文档。