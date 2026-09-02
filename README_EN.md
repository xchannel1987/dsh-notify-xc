# dsh-notify-xc

[![npm version](https://img.shields.io/npm/v/dsh-notify-xc.svg)](https://www.npmjs.com/package/dsh-notify-xc)
[![license](https://img.shields.io/npm/l/dsh-notify-xc.svg)](https://github.com/xchannel1987/dsh-notify-xc/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/dsh-notify-xc.svg)](https://www.npmjs.com/package/dsh-notify-xc)
[![DSH](https://img.shields.io/badge/DeepSeek-Harness-blue)](https://github.com/deepseek-ai/DeepSeek-Harness)

[中文](README.md) | [English](README_EN.md)

**Browser notification plugin for DeepSeek Harness** — system-level toasts (Windows notification center) when the agent finishes a task or needs your input / approval / plan review. Click the toast to jump straight to the session.

## ✨ Core Features

### 🔔 Task-Done Notifications
- A "Task Finished" toast pops up when a session transitions from running to idle
- Content includes the session title + last reply summary (when the session is open)

### 📢 Needs-Input Notifications
Immediately notifies you when the agent is waiting:

| Scenario | Toast Content |
|----------|---------------|
| question | Needs your answer |
| approval | Needs your approval |
| plan-review | Please review the plan |

### 🖱️ Click-to-Open
- Clicking the toast focuses the page and opens the owning session

### ⚙️ Three Send Modes
| Mode | Behavior |
|------|----------|
| Always | Toast for every event (default) |
| Background | Toast only while the page is hidden (you are in another window) |
| Off | Disable system notifications |

### 🛡️ False-Positive Guards
- **Baseline** : The first snapshot after load / reconnect is a baseline only; no historical finishes are replayed
- **Deduplication** : The same pending request is never re-sent
- **Subagent Filtering** : Subagent sessions are skipped unless enabled

## 📦 Installation

```bash
# Using DSH CLI
dsh plugin --profile web add dsh-notify-xc

# Or using npm
npm install dsh-notify-xc
```

Restart DSH after installation; client-bundle changes only need a page refresh.

## ⚙️ Configuration

Settings → **Task Alerts** section (persisted in localStorage):

| Option | Default | Description |
|--------|---------|-------------|
| Enable notifications | true | Master switch; no toasts when off |
| Include subagent notifications | false | Whether to notify for subagent sessions |
| System notification mode | Always | Off / Background / Always |

The browser asks for notification permission on your first click; you can also grant it manually in the settings page and send a test toast.

## 🎮 Usage

1. Open DSH Settings → Task Alerts
2. Make sure "Enable notifications" is on and permission reads "Granted"
3. Click "Test" to verify the notification chain (fires regardless of the send mode)
4. Toasts appear automatically when the agent finishes a task or needs your action

## 🔧 Compatibility

- Compatibility rewrite of [dsh-agent-notify](https://github.com/chidaic/dsh-agent-notify) for current DSH, verified against 0.1.2-alpha.4
- Pure browser-side plugin (empty host half), hand-written bundle with no build step
- Settings page registered into the official `settings.section` slot (same UI root as official settings pages)

## 📄 License

[MIT](LICENSE)

## 🔗 Links

- [GitHub](https://github.com/xchannel1987/dsh-notify-xc)
- [npm](https://www.npmjs.com/package/dsh-notify-xc)
- [Issues](https://github.com/xchannel1987/dsh-notify-xc/issues)
