# dsh-notify-xc

**Browser notifications for DeepSeek Harness** — a system-level notification (browser Notification API → Windows notification center toast, system sound) when the agent finishes a task or needs your input / approval / plan review. Works no matter which window you are in; clicking the toast focuses the page and opens the owning session. Pure system prompts: no in-page popups, no synthesized sounds, no extra UI chrome.

> This plugin is a compatibility rewrite of [dsh-agent-notify](https://github.com/chidaic/dsh-agent-notify) for the current DSH (verified against 0.1.2-alpha.4). Directory layout and code style follow [dsh-session-xc](https://github.com/xchannel1987/dsh-session-xc).

## Features

- **Task-done notifications**: a session flipping `running:true -> false` sends a "Task finished" toast (with the last assistant reply's first 90 chars when the session is open).
- **Needs-input notifications**: `question` → "Needs your answer"; `approval` / `plan-review` → "Needs your approval / please review the plan".
- **Three system modes**: off / background-only (page hidden) / always (default).
- **Click-to-open**: clicking a toast focuses the page and opens the owning session.
- **Auto permission**: asks for notification permission on the first user gesture.
- **Settings page** = a first-level page in the official Settings surface (Settings → Task Alerts) via the `settings.section` slot; persisted in `localStorage` (`dsh.notifyXc.settings.v1`), with a one-click test button.
- **False-positive guards**: first snapshot after load/reconnect is a baseline only; finishes during a disconnect are not replayed; the same pending request is never re-sent; subagent sessions are skipped unless enabled.
- **Diagnostics**: test button ignores the send mode; console hook `window.__dshNotifyXc.test()`.

## Install

```bash
# local tgz (run build.ps1 first)
dsh plugin --profile web add dsh-notify-xc@file:D:/workspace/dsh-notify-xc/dsh-notify-xc-0.1.0.tgz

# or after publishing to npm
dsh plugin --profile web add dsh-notify-xc
```

Restart DSH after installation; client-bundle changes only need a page refresh (hard-refresh with Ctrl+Shift+R if cached).

## Compatibility notes (dsh-agent-notify 1.0.0 → this plugin)

| # | Problem | Impact | Fix |
|---|---------|--------|-----|
| A | `require("@deepseek-ai/dsh-client-runtime/client")` plus `dsh.client.inject` pointing at the now-removed `@deepseek-ai/dsh-client-runtime` package | **Fatal**: that package no longer exists in current DSH (client module system was split into `dsh-client-modules` / `dsh-cordis-client-runner` / `dsh-web-frontend`); factory materialization throws (`client-modules: require("...") missed the module table ...`) and the plugin row fails to start | Removed the require — a package name is the module now; no explicit platform require needed |
| B | Pending interactions read from `summary.pendingInteraction` in the sessions-list snapshot | **Broken**: the field was removed from the list store | Subscribe to `ctx.uiSession.pendingInteractions` (`Map<sessionId, PendingApproval|PendingQuestion>`, `kind ∈ approval|question|plan-review`), dedupe by object identity |
| C | Registering the settings page directly via `ctx.slots.register(...)` | Works but not robust against owner (un)mounting | Wrap in `ctx.slots.inject("settings.section", () => ctx.slots.register(...))`; options `id/order/label` match the current slot contract |
| D | Stale `dsh.client.inject` entries | Unreliable load ordering | Point at bundles that exist today: `dsh-client-connection` / `dsh-client-ui-slots` / `dsh-client-ui-session` / `dsh-api-session-controller` |
| E | `ctx.on("connection/reset")` / `ctx.effect` / `sessions.binding(...).session.getSnapshot()` | Still available | Kept, always guarded (API drift degrades to console logs, never takes the shell down) |

## Layout

```
dsh-notify-xc/
├── package.json          # dsh.bundle.patch + dsh.client declaration (inject: current client bundles, platform: web)
├── cordis.patch.yml      # plugin row (bundle patch)
├── build.ps1             # npm pack script
├── LICENSE               # MIT
├── README.md / README_EN.md / CHANGELOG.md
└── lib/
    ├── index.js          # host half (empty apply; pure browser-side plugin)
    └── client.js         # browser bundle (hand-written, no build step; lib/ is the source of truth)
```

## Development

- After editing `lib/client.js`: `node --check lib/client.js`.
- Bump `BUNDLE_VERSION` on every behavioral change (shown in the settings page for stale-cache diagnosis).
- Package: `powershell -File build.ps1`.

## License

MIT
