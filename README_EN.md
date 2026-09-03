# dsh-notify-xc

[![npm version](https://img.shields.io/npm/v/dsh-notify-xc.svg)](https://www.npmjs.com/package/dsh-notify-xc)
[![license](https://img.shields.io/npm/l/dsh-notify-xc.svg)](https://github.com/xchannel1987/dsh-notify-xc/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/dsh-notify-xc.svg)](https://www.npmjs.com/package/dsh-notify-xc)
[![DSH](https://img.shields.io/badge/DeepSeek-Harness-blue)](https://github.com/deepseek-ai/DeepSeek-Harness)

[中文](README.md) | [English](README_EN.md)

**Browser notification plugin for DeepSeek Harness** — system-level toasts (Windows notification center) when the agent finishes a task, hits an error, or needs your input / approval / plan review. Click the toast to jump straight to the session.

## ✨ Core Features

### 🔔 Task-Done Notifications
- A "Task Finished" toast pops up when a session transitions from running to idle
- Content includes the session title + last reply summary (when the session is open)

### 🛑 Error Notifications
- A "Run Error" toast pops up when a session ends a turn with an error (turn-error)
- The error summary is shown in the toast for quick triage
- **Mutually exclusive** with task-done: an errored turn sends only "Run Error", never "Task Finished"
- Single tool-level failures and manual interruptions are not notified (the agent usually retries)

### 📢 Needs-Input Notifications
Immediately notifies you when the agent is waiting:

| Scenario | Toast Content |
|----------|---------------|
| question | Needs your answer |
| approval | Needs your approval |
| plan-review | Please review the plan |

- **Persistent mode** (configurable): needs-input toasts stay in the notification center until you act on them

### 🖱️ Click-to-Open
- Clicking the toast focuses the page and opens the owning session
- Toasts carry the official DSH icon for easier recognition

### 📁 Workspace Attribution
- When enabled, toasts are prefixed with [workspace] so you can tell sessions apart at a glance
- The workspace name is derived from the session path, supporting both Windows and POSIX separators

### ⚙️ Per-Type Toggles
Each of the three types (task-done / needs-input / error) has its own independent toggle; enable or disable them without affecting the others.

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
| Task-done notifications | true | Notify when a task finishes |
| Needs-input notifications | true | Notify when your input / approval / review is needed |
| Error notifications | true | Notify when a run fails |
| Include subagent notifications | false | Whether to notify for subagent sessions |
| Persistent needs-input | true | Keep needs-input toasts until you act on them |
| Show workspace attribution | true | Prefix toasts with [workspace] |
| System notification mode | Always | Off / Background / Always |

The browser asks for notification permission on your first click; you can also grant it manually in the settings page and send a test toast. On mobile browsers without notification support, the settings page greys out and shows a notice.

## 🎮 Usage

1. Open DSH Settings → Task Alerts
2. Toggle each notification type as you like (all on by default); make sure permission reads "Granted"
3. Click "Test" to verify the notification chain (fires regardless of the send mode)
4. Toasts appear automatically when the agent finishes a task, hits an error, or needs your action

## 🔧 Compatibility

- Compatibility rewrite of [dsh-agent-notify](https://github.com/chidaic/dsh-agent-notify) for current DSH, verified against 0.1.2-alpha.4
- Pure browser-side plugin (empty host half), hand-written bundle with no build step
- Settings page registered into the official `settings.section` slot (same UI root as official settings pages)
- Depends on the browser `Notification` API (desktop Edge / Chrome); on mobile browsers without support the settings page greys out and shows a notice (iOS system notifications only work via Service Worker Web Push, which this plugin does not implement)

## 📄 License

[MIT](LICENSE)

## 🔗 Links

- [GitHub](https://github.com/xchannel1987/dsh-notify-xc)
- [npm](https://www.npmjs.com/package/dsh-notify-xc)
- [Issues](https://github.com/xchannel1987/dsh-notify-xc/issues)
