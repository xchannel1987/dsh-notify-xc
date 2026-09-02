# dsh-notify-xc

[![npm version](https://img.shields.io/npm/v/dsh-notify-xc.svg)](https://www.npmjs.com/package/dsh-notify-xc)
[![license](https://img.shields.io/npm/l/dsh-notify-xc.svg)](https://github.com/xchannel1987/dsh-notify-xc/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/dsh-notify-xc.svg)](https://www.npmjs.com/package/dsh-notify-xc)
[![DSH](https://img.shields.io/badge/DeepSeek-Harness-blue)](https://github.com/deepseek-ai/DeepSeek-Harness)

[中文](README.md) | [English](README_EN.md)

**DSH 浏览器通知插件** —— agent 完成任务或需要你输入 / 批准 / 审阅计划时，弹出系统级通知（Windows 通知中心气泡），点击气泡直达会话。

## ✨ 核心特性

### 🔔 任务完成通知
- 会话从运行中变为停止时，弹出「任务完成」系统通知
- 通知内容含会话标题 + 最后一条回复摘要（会话已打开时）

### 📢 需要输入通知
agent 等待你操作时立即提醒：

| 场景 | 通知内容 |
|------|----------|
| question | 需要你的回答 |
| approval | 需要你的批准 |
| plan-review | 请审阅计划 |

### 🖱️ 点击直达会话
- 点击系统通知气泡，自动聚焦页面并打开对应会话

### ⚙️ 三种发送模式
| 模式 | 行为 |
|------|------|
| 始终发送 | 每个事件都弹通知（默认） |
| 后台时发送 | 仅页面隐藏（你在别的窗口）时弹 |
| 不发送 | 关闭系统通知 |

### 🛡️ 防误报设计
- **基线机制**：页面加载 / 重连后首个快照仅作基线，不重放历史完成事件
- **去重**：同一 pending 请求不重复通知
- **子代理过滤**：子代理会话默认不通知（可开启）

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
| 启用通知 | true | 主开关，关闭后不发任何通知 |
| 包含子代理通知 | false | 是否通知子代理会话 |
| 系统通知模式 | 始终发送 | 不发送 / 后台时发送 / 始终发送 |

首次点击页面会自动请求通知权限（浏览器询问），也可在设置页手动授权并发送测试通知诊断。

## 🎮 使用

1. 打开 DSH 设置 → 任务通知
2. 确认「启用通知」已开启，权限显示「已授权」
3. 点击「测试」按钮验证通知链路（无视发送模式直接弹一条）
4. agent 完成任务或需要你操作时，通知中心自动弹出气泡

## 🔧 兼容性

- 基于 [dsh-agent-notify](https://github.com/chidaic/dsh-agent-notify) 面向新版 DSH 的兼容重写，适配 DSH 0.1.2-alpha.4
- 纯浏览器端插件（host half 为空），手写 bundle 无构建步骤
- 设置页注册进官方 `settings.section` slot（与官方设置页同源 UI）

## 📄 许可证

[MIT](LICENSE)

## 🔗 链接

- [GitHub](https://github.com/xchannel1987/dsh-notify-xc)
- [npm](https://www.npmjs.com/package/dsh-notify-xc)
- [问题反馈](https://github.com/xchannel1987/dsh-notify-xc/issues)
