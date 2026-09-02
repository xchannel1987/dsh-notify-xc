# CHANGELOG

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
