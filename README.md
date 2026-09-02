# dsh-notify-xc

**DSH 浏览器通知插件** —— agent 完成任务或需要你输入 / 批准 / 审阅计划时，弹出**系统级通知**（浏览器 Notification API → Windows 通知中心气泡，声音为系统通知音）。无论你在哪个窗口都能看到；点击气泡直达对应会话。纯系统提示：无网页内弹窗、无合成音、无额外 UI 按钮。

> 本插件是 [dsh-agent-notify](https://github.com/chidaic/dsh-agent-notify) 面向新版 DSH 的**兼容性重写**（目录结构与代码风格参考 [dsh-session-xc](https://github.com/xchannel1987/dsh-session-xc)）。dsh-agent-notify 1.0.0 在新版 DSH（0.1.2-alpha.4，client 模块体系重构后）启动即报错，原因与修复见下文「兼容性说明」。

## 功能

- **任务完成通知**：会话从 `running` 变为停止时，发送「任务完成」系统通知（含最后一条 assistant 回复前 90 字摘要，仅当会话已打开时）。
- **需要输入通知**：agent 发起提问（`question`）时发送「需要你的回答」。
- **批准 / 计划审阅通知**：`approval` / `plan-review` 时发送「需要你的批准 / 请审阅计划」。
- **系统级通知**：三种模式可选——`不发送` / `后台时发送`（页面隐藏，你在别的窗口）/ `始终发送`（默认）。
- **点击直达**：点击系统通知聚焦页面并打开对应会话。
- **自动授权**：首次点击/按键页面时自动请求通知权限；设置页也可手动授权。
- **设置页** = DSH 官方设置界面的一级页面：设置 → **任务提示**（注册进官方 `settings.section` slot）。包含启用开关、是否包含子代理通知、系统通知模式、权限状态与授权、**发送测试通知**（一键诊断）。设置保存在 `localStorage`（`dsh.notifyXc.settings.v1`）。
- **防误报**：页面加载/重连后首个快照仅作基线；重连期间发生的完成不会恢复后误报；同一 pending 请求不重复通知；子代理会话默认不通知（可开启）。
- **诊断**：设置页「发送测试通知」无视发送模式直接弹一条通知并显示结果；控制台钩子 `window.__dshNotifyXc.test()` 同效。

## 安装

```bash
# 本地开发装 tgz（先运行 build.ps1 打包）
dsh plugin --profile web add dsh-notify-xc@file:D:/workspace/dsh-notify-xc/dsh-notify-xc-0.1.0.tgz

# 或发布到 npm 后
dsh plugin --profile web add dsh-notify-xc
```

安装后**重启 DSH**，浏览器端 bundle 变更后**刷新页面**即可生效（`/plugins/dsh-notify-xc/client.js` 每次读取最新文件；遇旧缓存用 Ctrl+Shift+R 硬刷新）。

## 兼容性说明（dsh-agent-notify 1.0.0 → dsh-notify-xc）

dsh-agent-notify 1.0.0 面向旧版 DSH client 模块体系编写，在新版 DSH（0.1.2-alpha.4）下启动即报错，根因与修复：

| # | 问题 | 影响 | 修复 |
|---|------|------|------|
| A | `lib/client.js` 顶部 `require("@deepseek-ai/dsh-client-runtime/client")`，且 `package.json` `dsh.client.inject` 声明了不存在的 `@deepseek-ai/dsh-client-runtime` | **致命**。新版 DSH 已移除该包（client 模块体系拆分为 `dsh-client-modules` / `dsh-cordis-client-runner` / `dsh-web-frontend`）。bundle factory 物化时 `require` 命中模块表直接 throw（`client-modules: require("...") missed the module table ...`），插件行启动失败 | 移除该 require；新版包名即模块，浏览器侧无需显式 require 平台 bundle |
| B | 待处理交互读取 `sessions.list` 快照的 `summary.pendingInteraction` | **功能失效**。新版会话列表 store 的 `byId` 已移除该字段（现为 `{id, displayTitle, running, completed?, blank, updatedAt, origin? ...}`） | 改为订阅 `ctx.uiSession.pendingInteractions`（`Map<sessionId, PendingApproval|PendingQuestion>`，`kind ∈ approval|question|plan-review`），按对象身份变化去重 |
| C | 设置页直接 `ctx.slots.register({name:"settings.section", ...}, Card)` | 兼容但不够稳。新版 slot 目录要求通过 `ctx.slots.inject(key, () => ctx.slots.register(...))` 包裹（声明存在时注册、卸载时自动清理） | 改为 `ctx.slots.inject("settings.section", ...)`，register 选项 `id/order/label` 与新版契约一致 |
| D | `dsh.client.inject` 引旧模块 | 依赖不达，启动顺序无保证 | 改为新版实际存在的 client bundle：`dsh-client-connection` / `dsh-client-ui-slots` / `dsh-client-ui-session` / `dsh-api-session-controller` |
| E | `ctx.on("connection/reset")` / `ctx.effect` / `sessions.binding(...).session.getSnapshot()` | 新版仍可用 | 保留，全部守卫式调用（API 漂移时降级为 console 日志，不拖垮 shell） |

已在新版 DSH 源码中逐一核对：`settings.section` slot 契约（list 型，注册选项 id/order/label）、`ctx.sessions`（open/binding/list）、`ctx.uiSession.pendingInteractions` store、`connection/reset` 事件声明、bundle 物化的 inject 等待/require 解析逻辑。

## 目录结构

```
dsh-notify-xc/
├── package.json          # dsh.bundle.patch + dsh.client 声明（inject: 新版 client bundle, platform: web）
├── cordis.patch.yml      # 插件行（bundle patch）
├── build.ps1             # npm pack 打包脚本
├── LICENSE               # MIT
├── README.md / README_EN.md / CHANGELOG.md
└── lib/
    ├── index.js          # host half（空 apply，纯浏览器端插件）
    └── client.js         # 浏览器 bundle（手写，无构建步骤，lib/ 即真源）
```

## 开发

- 修改 `lib/client.js` 后运行 `node --check lib/client.js` 验证语法。
- 每次行为变更请递增 `BUNDLE_VERSION`（设置页会显示，用于诊断浏览器缓存旧 bundle）。
- 打包：`powershell -File build.ps1`（生成 `dsh-notify-xc-<version>.tgz`）。

## 许可

MIT
