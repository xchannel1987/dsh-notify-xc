# dsh-notify-xc

[![npm version](https://img.shields.io/npm/v/dsh-notify-xc.svg)](https://www.npmjs.com/package/dsh-notify-xc)
[![license](https://img.shields.io/npm/l/dsh-notify-xc.svg)](https://github.com/xchannel1987/dsh-notify-xc/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/dsh-notify-xc.svg)](https://www.npmjs.com/package/dsh-notify-xc)
[![DSH](https://img.shields.io/badge/DeepSeek-Harness-blue)](https://github.com/deepseek-ai/DeepSeek-Harness)

[中文](README.md) | [English](README_EN.md)

**DSH 浏览器通知插件** —— agent 完成任务、运行出错或需要你输入 / 批准 / 审阅计划时，弹出系统级通知（Windows 通知中心气泡），点击气泡直达会话。

## ✨ 核心特性

### 🔔 任务完成通知
- 会话从运行中变为停止时，弹出「任务完成」系统通知
- 通知内容含会话标题 + 最后一条回复摘要（会话已打开时）
- **等子代理时不算完成**：主会话把活交给后台子代理（含工作流 / Ralph / 后台 job）后会
  「让出回合」，此时 running 虽然变成 false，但会话并没有结束 —— 不弹通知，等这些活全部
  结束后再判定（可关闭，见设置「等子代理 / 工作流时不通知」）
- 后台常驻 shell 任务（例如你自己让 agent 后台起的 dev server）**不参与**这个判定，
  否则任务完成通知会被永久吞掉

### 🛑 运行出错通知
- 会话以 session 级错误结束时（`lastAgentError`），弹出「运行出错」系统通知
- 错误信息摘要随通知展示，便于第一时间定位（429 限流、API 错误、认证失败等）
- 与任务完成**互斥**：本轮出错只发「运行出错」，不发「任务完成
- 工具级单次失败与手动中断不通知（agent 通常会自行重试）
- 当前无法区分「用户主动中断」和「正常完成」（session snapshot 不含 turn 结束原因），未来版本将支持

### 📢 需要输入通知
agent 等待你操作时立即提醒：

| 场景 | 通知内容 |
|------|----------|
| question | 需要你的回答 |
| approval | 需要你的批准 |
| plan-review | 请审阅计划 |

- **常驻模式**（可配置）：需要输入的通知不会自动消失，留在通知中心直到你处理

### 🖱️ 点击直达会话
- 点击系统通知气泡，自动聚焦页面并打开对应会话
- 通知带 DSH 官方图标，气泡更易辨认

### 📁 通知显示工作区归属
- 开启后通知标题带 [工作区名] 前缀，多项目混跑时一眼定位
- 工作区名从会话路径自动提取，兼容 Windows / POSIX 分隔符

### ⚙️ 通知类型可配置
三类通知各有独立开关（任务完成 / 需要输入 / 运行出错），按需开关互不影响。

### 🛡️ 防误报设计
- **基线机制**：页面加载 / 重连后首个快照仅作基线，不重放历史完成事件
- **去重**：同一 pending 请求不重复通知
- **子代理过滤**：子代理会话默认不通知（可开启）
- **让出回合 ≠ 完成**：仍有在跑的子代理（含孙代理等更深层级）或未结束的代理类后台任务时，
  不发「任务完成 / 运行出错」；这些活结束后会自动补判一次，通知不会丢
- **宽限期复检**：完成通知延迟 1.2s 发出，期间会话被后台结果唤醒重新运行则取消
  （躲开状态帧到达顺序造成的瞬时误报）
- 排查用：控制台 `window.__dshNotifyXc.probe('<sessionId>')` 可看该会话当前是否被判定
  「仍在等后台工作 / 已挂起 / 有未发出的定时器」

## 📦 安装

```bash
# 使用 DSH CLI
dsh plugin --profile web add dsh-notify-xc

# 或使用 npm
npm install dsh-notify-xc
```

安装后重启 DSH，浏览器端 bundle 变更后刷新页面即可生效。

## ⚙️ 配置

设置 → **任务通知** 分区（localStorage 持久化）：

| 选项 | 默认值 | 说明 |
|------|--------|------|
| 任务完成通知 | true | 是否通知任务完成 |
| 需要输入通知 | true | 是否通知需要你输入 / 批准 / 审阅 |
| 运行出错通知 | true | 是否通知运行出错 |
| 包含子代理通知 | false | 是否通知子代理会话 |
| 等子代理 / 工作流时不通知 | true | 会话把活交给后台子代理 / 工作流时不算完成，不弹通知（后台 shell 常驻任务不影响） |
| 需要输入通知常驻 | true | 需要输入的通知不自动消失，直到你处理 |
| 通知显示工作区归属 | true | 通知标题带 [工作区名] 前缀 |
| 系统通知模式 | 始终发送 | 不发送 / 后台时发送 / 始终发送 |

首次点击页面会自动请求通知权限（浏览器询问），也可在设置页手动授权并发送测试通知诊断。移动浏览器不支持系统通知时，设置页会自动置灰并提示。

## 🎮 使用

1. 打开 DSH 设置 → 任务通知
2. 按需开关各类型通知（默认全开），确认权限显示「已授权」
3. 点击「测试」按钮验证通知链路（无视发送模式直接弹一条）
4. agent 完成任务、运行出错或需要你操作时，通知中心自动弹出气泡

## 🔧 兼容性

- 基于 [dsh-agent-notify](https://github.com/chidaic/dsh-agent-notify) 面向新版 DSH 的兼容重写，适配 DSH 0.1.2-alpha.4
- 纯浏览器端插件（host half 为空），手写 bundle 无构建步骤
- 设置页注册进官方 `settings.section` slot（与官方设置页同源 UI）
- 依赖浏览器 `Notification` API（桌面 Edge / Chrome 可用）；移动浏览器不支持时设置页置灰并提示（iOS 的系统通知仅支持 Service Worker Web Push，本插件未接入，不支持）

## 📄 许可证

[MIT](LICENSE)

## 🔗 链接

- [GitHub](https://github.com/xchannel1987/dsh-notify-xc)
- [npm](https://www.npmjs.com/package/dsh-notify-xc)
- [问题反馈](https://github.com/xchannel1987/dsh-notify-xc/issues)