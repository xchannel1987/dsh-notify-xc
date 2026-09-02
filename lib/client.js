/**
 * dsh-notify-xc — 浏览器端 bundle（手写，无构建步骤）v1.0.0
 *
 * 功能（继承 dsh-agent-notify 的行为）：
 *   1. 订阅会话列表 store（ctx.sessions.list），会话 running:true -> false 时发
 *      "任务完成" 系统通知（浏览器 Notification API，Windows 通知中心气泡）。
 *   2. 订阅待处理交互 store（ctx.uiSession.pendingInteractions），agent 发起提问
 *      / 批准 / 计划审阅时发 "需要你的输入/批准/审阅" 系统通知。
 *   3. 点击系统通知：聚焦页面 + 打开对应会话（ctx.sessions.open）。
 *   4. 设置页注册进官方设置的一级页面（settings.section slot → 设置 → 任务提示）：
 *      启用开关 / 包含子代理 / 系统通知模式（不发送/后台时发送/始终发送）/
 *      权限状态 / 发送测试通知。设置持久化在 localStorage（dsh.notifyXc.settings.v1）。
 *   5. 首次用户手势自动请求通知权限；调试钩子 window.__dshNotifyXc。
 *
 * 兼容性修复（相对 dsh-agent-notify 1.0.0，适配 DSH 0.1.2-alpha.4）：
 *   A. 移除 require("@deepseek-ai/dsh-client-runtime/client")——该模块在新版 DSH
 *      已不存在（client 模块体系拆分为 dsh-client-modules / dsh-cordis-client-runner
 *      / dsh-web-frontend），factory 物化时 require 命中模块表会直接 throw，
 *      插件行启动报错。新版无需显式 require 平台 bundle，包名即模块（exports
 *      ["./client"] 由 dsh.client 声明自动入图）。
 *   B. package.json 的 dsh.client.inject 改为新版实际存在的 client bundle
 *      （dsh-client-connection / dsh-client-ui-slots / dsh-client-ui-session /
 *      dsh-api-session-controller），保证依赖先于本 bundle 物化。
 *   C. 待处理交互不再从会话列表快照读 summary.pendingInteraction（该字段在新版
 *      列表 store 中已移除），改为订阅 ctx.uiSession.pendingInteractions
 *      （Map<sessionId, PendingApproval|PendingQuestion>，kind ∈
 *      approval|question|plan-review）。
 *   D. settings.section 注册改为 ctx.slots.inject("settings.section", ...) 包裹，
 *      遵循新版 slot 契约（register 选项 id/order/label），声明存在时注册、
 *      卸载时自动清理。
 *   E. ctx.on("connection/reset") / ctx.effect / sessions.binding 在新版仍可用，
 *      全部保持守卫式调用，任何一处 API 漂移都降级为 console 日志，绝不拖垮页面。
 *
 * 失败策略：本 bundle 不得让 web shell 挂掉——所有 DOM/API 交互都有守卫，
 * 订阅失败降级为 console 日志。
 */
window.__ModuleLoader__.load({
  id: 'dsh-notify-xc',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var React = require('react');

    /** 每次行为变更递增；设置页展示，用于排查浏览器缓存旧 bundle。 */
    var BUNDLE_VERSION = '1.0.0';
    try {
      console.log('[dsh-notify-xc] bundle v' + BUNDLE_VERSION + ' loaded')
    } catch (error) { /* ignore */ }

    // ---------------------------------------------------------------- settings
    var SETTINGS_KEY = 'dsh.notifyXc.settings.v1';
    var DEFAULT_SETTINGS = {
      enabled: true,
      subagents: false,
      // 系统通知（浏览器 Notification API）：off 不发送；background 仅页面隐藏时
      // 发送（你在别的窗口）；always 每个事件都发送。
      system: 'always',
    };

    function loadSettings() {
      var base = Object.assign({}, DEFAULT_SETTINGS);
      try {
        var raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return base;
        var parsed = JSON.parse(raw);
        if (typeof parsed.enabled === 'boolean') base.enabled = parsed.enabled;
        if (typeof parsed.subagents === 'boolean') base.subagents = parsed.subagents;
        if (parsed.system === 'off' || parsed.system === 'background' || parsed.system === 'always') {
          base.system = parsed.system;
        }
      } catch (error) {
        console.warn('[dsh-notify-xc] settings read failed:', error);
      }
      return base;
    }

    var settings = loadSettings();

    function saveSettings() {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (error) {
        console.warn('[dsh-notify-xc] settings write failed:', error);
      }
    }

    // ------------------------------------------------------------ card styles
    var st = {
      card: { display: "flex", flexDirection: "column", gap: "10px", padding: "14px 16px", borderRadius: "8px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))", background: "var(--dsw-alias-bg-base, #ffffff)", color: "var(--dsw-alias-label-primary, #0f1115)" },
      title: { margin: 0, fontSize: "14px", lineHeight: "22px", fontWeight: 600 },
      desc: { margin: "0 0 2px", fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #81858c)" },
      sep: { height: "1px", margin: "2px 0", background: "var(--dsw-alias-border-l2, rgba(0,0,0,0.12))", border: "0" },
      row: { display: "flex", alignItems: "center", gap: "10px" },
      label: { flex: "0 0 100px", fontSize: "13px", lineHeight: "20px", color: "var(--dsw-alias-label-secondary, #61666b)", textAlign: "right" },
      check: { width: "16px", height: "16px", accentColor: "var(--dsw-alias-brand-primary, #3964fe)" },
      select: { flex: "1", minWidth: 0, maxWidth: "160px", padding: "5px 10px", fontSize: "13px", lineHeight: "20px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))", background: "var(--dsw-alias-bg-base, #ffffff)", color: "var(--dsw-alias-label-primary, #0f1115)" },
      hint: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #81858c)" },
      footer: { display: "flex", alignItems: "center", gap: "12px", marginTop: "2px" },
      statusText: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-secondary, #61666b)", flex: "1", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      testBtn: { flex: "none", padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))", cursor: "pointer", fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-secondary, #61666b)", background: "transparent" },
      permBadge: { fontSize: "12px", lineHeight: "18px", whiteSpace: "nowrap" },
    }

    function truncate(text, max) {
      if (text.length <= max) return text;
      return text.slice(0, max - 1).trimEnd() + '…';
    }

    // ------------------------------------------- system-level notifications
    var SYSTEM_MODES = {
      off: '不发送',
      background: '后台时发送',
      always: '始终发送',
    };

    function systemNotificationSupported() {
      return typeof window !== 'undefined' && 'Notification' in window;
    }

    function systemPermission() {
      if (!systemNotificationSupported()) return 'unsupported';
      return window.Notification.permission; // 'granted' | 'denied' | 'default'
    }

    /** 请求浏览器通知权限（必须由用户手势触发）。 */
    function requestSystemPermission() {
      if (!systemNotificationSupported()) return Promise.resolve('unsupported');
      try {
        return Promise.resolve(window.Notification.requestPermission());
      } catch (error) {
        console.warn('[dsh-notify-xc] permission request failed:', error);
        return Promise.resolve('denied');
      }
    }

    /** 当前设置是否要为该事件发系统通知。 */
    function shouldSendSystemNotification() {
      if (!settings.enabled) return false;
      if (settings.system === 'off') return false;
      if (settings.system === 'always') return true;
      // 'background'：仅页面隐藏（用户在别的窗口）时发送。
      return typeof document !== 'undefined' && document.hidden === true;
    }

    /**
     * 弹系统级通知（浏览器 Notification API）。点击聚焦页面并打开对应会话。
     *
     * 不带 tag 是有意为之：Windows 上 Chrome 对同 tag 通知只静默更新不弹新气泡，
     * 会导致后续相同 tag 的通知"消失"（dsh-agent-notify 历史根因），因此每条
     * 通知都是全新气泡。
     */
    function sendSystemNotification(kind, title, detail, sessionId) {
      if (!shouldSendSystemNotification()) return;
      if (systemPermission() !== 'granted') return;
      try {
        var body = detail && detail !== '' ? detail : title;
        var notification = new window.Notification(title, {
          body: truncate(body, 200),
        });
        notification.onclick = function () {
          try {
            window.focus();
            if (sessionId && ctxRef && ctxRef.sessions && typeof ctxRef.sessions.open === 'function') {
              ctxRef.sessions.open(sessionId);
            }
          } catch (error) { /* ignore */ }
          try { notification.close(); } catch (error) { /* ignore */ }
        };
      } catch (error) {
        console.warn('[dsh-notify-xc] system notification failed:', error);
      }
    }

    /** 诊断用：无视发送模式直接弹测试通知（仍需权限）。 */
    function sendTestNotification() {
      if (systemPermission() === 'denied') return '权限被拒绝：点地址栏 🔒 → 网站设置 → 通知 → 允许';
      if (systemPermission() === 'default') return '未授权：再点一次本按钮触发浏览器询问';
      if (systemPermission() === 'unsupported') return '浏览器不支持系统通知（请用 Edge / Chrome）';
      try {
        var notification = new window.Notification('测试通知', {
          body: '如果你看到这条消息，系统通知链路正常 ✓',
        });
        notification.onclick = function () {
          try { window.focus(); } catch (error) { /* ignore */ }
          try { notification.close(); } catch (error) { /* ignore */ }
        };
        return '已发送 ✓（若未弹出，检查 Windows 通知设置与专注助手）';
      } catch (error) {
        console.warn('[dsh-notify-xc] test notification failed:', error);
        return '发送失败：' + (error && error.message ? error.message : String(error));
      }
    }

    // 首次用户手势请求权限（浏览器要求手势；最多请求一次）。
    var permissionAsked = false;
    function maybeAskPermission() {
      if (permissionAsked) return;
      if (!systemNotificationSupported()) return;
      if (settings.system === 'off') return;
      if (window.Notification.permission !== 'default') return;
      permissionAsked = true;
      requestSystemPermission().then(function (permission) {
        if (permission === 'granted') {
          sendSystemNotification('done', '系统通知已授权', '任务完成时将弹出系统级通知');
        }
      }).catch(function () { /* ignore */ });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', maybeAskPermission, { passive: true });
      document.addEventListener('keydown', maybeAskPermission, { passive: true });
    }

    // ------------------------------------------------------------------- card
    /**
     * 设置页：注册进官方 settings.section slot（设置 → 任务提示）。
     * 纯 createElement 构建，无 JSX 无需构建步骤；读写 bundle 级 settings 并持久化
     * localStorage，组件 state 仅驱动重渲染。
     */
    function SettingsCard() {
      var state = React.useState(function () {
        return {
          enabled: settings.enabled,
          subagents: settings.subagents,
          system: settings.system,
          perm: systemPermission(),
        };
      });
      var value = state[0];
      var setState = state[1];
      var update = function (patch) {
        Object.assign(settings, patch);
        saveSettings();
        setState(function (prev) { return Object.assign({}, prev, patch); });
      };
      var refreshPerm = function () { setState(function (prev) { return Object.assign({}, prev, { perm: systemPermission() }); }); };

      var e = React.createElement;

      var permLabel =
        value.perm === 'granted' ? '已授权' :
        value.perm === 'denied' ? '已拒绝' :
        value.perm === 'unsupported' ? '不支持' : '未授权';

      var permColor =
        value.perm === 'granted' ? 'var(--dsw-alias-state-success-primary, #1a7f37)' :
        value.perm === 'denied' ? 'var(--dsw-alias-state-error-primary, #d93026)' : 'inherit';

      var statusLine = '通知 ' + (value.enabled ? '开' : '关') + ' · 系统通知 ' + SYSTEM_MODES[value.system] + ' · 权限 ' + permLabel;

      return e('div', { style: st.card },
        e('div', null,
          e('h3', { style: st.title }, '任务通知 (dsh-notify-xc)'),
          e('p', { style: st.desc }, 'agent 完成任务或需要操作时弹出系统通知，点击气泡直达会话。')
        ),
        e('label', { style: st.row },
          e('input', { type: 'checkbox', style: st.check, checked: value.enabled, onChange: function (ev) {
            update({ enabled: ev.target.checked });
            if (ev.target.checked) sendSystemNotification('done', '通知已开启', '任务完成时将弹出系统通知');
          }}),
          e('span', { style: st.hint }, '启用通知')
        ),
        e('label', { style: st.row },
          e('input', { type: 'checkbox', style: st.check, checked: value.subagents, onChange: function (ev) { update({ subagents: ev.target.checked }); }}),
          e('span', { style: st.hint }, '包含子代理通知')
        ),
        e('label', { style: st.row },
          e('span', { style: st.label }, '系统通知'),
          e('select', { style: st.select, value: value.system, onChange: function (ev) { update({ system: ev.target.value }); } },
            Object.keys(SYSTEM_MODES).map(function (mode) { return e('option', { value: mode, key: mode }, SYSTEM_MODES[mode]); }))
        ),
        e('label', { style: st.row },
          e('span', { style: st.label }, '权限'),
          e('span', { style: Object.assign({}, st.permBadge, { color: permColor }) }, permLabel),
          e('button', { type: 'button', style: st.testBtn, onClick: function () {
            var send = function () {
              var result = sendTestNotification();
              setState(function (prev) { return Object.assign({}, prev, { lastTest: result }); });
            };
            if (systemPermission() === 'default') {
              requestSystemPermission().then(function () { refreshPerm(); send(); });
            } else {
              send();
            }
          }}, '测试')
        ),
        value.perm === 'denied' ? e('p', { style: Object.assign({}, st.hint, { color: 'var(--dsw-alias-state-error-primary, #d93026)' }) }, '通知权限被拒绝：点地址栏 🔒 → 网站设置 → 通知 → 允许') : null,
        e('hr', { style: st.sep }),
        e('div', { style: st.footer },
          e('span', { style: st.statusText }, statusLine + (value.lastTest ? ' · ' + value.lastTest : ''))
        )
      );
    }

    // --------------------------------------------------------------- detection
    // 任务完成检测：sessionId -> { running } 基线，running true->false 触发通知。
    var prevRunning = new Map();
    // 待处理交互检测：sessionId -> interaction 对象（对象身份变化即新请求）。
    var prevPending = new Map();
    var ctxRef = null;

    var PENDING_LABELS = {
      question: { title: '需要你的回答', kind: 'ask' },
      approval: { title: '需要你的批准', kind: 'warn' },
      'plan-review': { title: '请审阅计划', kind: 'warn' },
    };

    function pendingInfo(kind) {
      return PENDING_LABELS[kind] || { title: '需要你的操作', kind: 'ask' };
    }

    /** 取会话最后一条 assistant 回复的前 90 字（仅当会话 binding 可用时）。 */
    function lastAssistantText(sessionId) {
      try {
        var sessions = ctxRef && ctxRef.sessions;
        if (!sessions || typeof sessions.binding !== 'function') return '';
        var binding = sessions.binding(sessionId);
        if (!binding || !binding.session || typeof binding.session.getSnapshot !== 'function') return '';
        var snap = binding.session.getSnapshot();
        var nodes = snap && Array.isArray(snap.nodes) ? snap.nodes : [];
        for (var i = nodes.length - 1; i >= 0; i--) {
          var node = nodes[i];
          if (!node || node.kind !== 'assistant') continue;
          var blocks = Array.isArray(node.blocks) ? node.blocks : [];
          var parts = [];
          for (var j = 0; j < blocks.length; j++) {
            var block = blocks[j];
            if (block && block.kind === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
              parts.push(block.text.trim());
            }
          }
          var text = parts.join(' ').replace(/\s+/g, ' ').trim();
          if (text !== '') return truncate(text, 90);
        }
      } catch (error) {
        console.warn('[dsh-notify-xc] summary read failed:', error);
      }
      return '';
    }

    /** 会话列表变化：running true->false = 任务完成。 */
    function handleListChange() {
      try {
        var sessions = ctxRef && ctxRef.sessions;
        if (!sessions || !sessions.list) return;
        var snap = sessions.list.getSnapshot();
        if (!snap || snap.phase !== 'ready') return;
        var byId = snap.byId || {};
        for (var id in byId) {
          if (!Object.prototype.hasOwnProperty.call(byId, id)) continue;
          var summary = byId[id];
          if (!summary) continue;
          // 子代理行默认不通知（设置可开启）。
          if (summary.origin === 'subagent' && !settings.subagents) {
            prevRunning.delete(id);
            continue;
          }
          var was = prevRunning.get(id);
          var nowRunning = summary.running === true;
          if (was === undefined) {
            // 首个快照（页面加载/重连基线）：只记录，不重放历史完成。
            prevRunning.set(id, { running: nowRunning });
            continue;
          }
          if (was.running && !nowRunning) {
            var title = summary.displayTitle || id;
            var summaryText = lastAssistantText(id);
            var detail = summaryText !== '' ? title + ' · ' + summaryText : title;
            sendSystemNotification('done', '任务完成', detail, id);
          }
          prevRunning.set(id, { running: nowRunning });
        }
        for (var key of Array.from(prevRunning.keys())) {
          if (!(key in byId)) prevRunning.delete(key);
        }
      } catch (error) {
        console.warn('[dsh-notify-xc] list change handling failed:', error);
      }
    }

    /**
     * 待处理交互变化：uiSession.pendingInteractions（Map<sessionId, interaction>）
     * 出现新请求（对象身份变化）时发"需要你输入"通知。兼容新版 DSH：此数据不再
     * 挂在会话列表快照的 summary.pendingInteraction 上。
     */
    function handlePendingChange() {
      try {
        if (!ctxRef) return;
        var uiSession = ctxRef.get ? ctxRef.get('uiSession') : ctxRef.uiSession;
        if (!uiSession || !uiSession.pendingInteractions) return;
        var snap = uiSession.pendingInteractions.getSnapshot();
        if (!snap || typeof snap.forEach !== 'function') return;

        var sessions = ctxRef.sessions;
        var byId = null;
        try {
          var listSnap = sessions && sessions.list ? sessions.list.getSnapshot() : null;
          byId = listSnap && listSnap.byId ? listSnap.byId : null;
        } catch (error) { /* ignore */ }

        snap.forEach(function (interaction, id) {
          if (!interaction) return;
          var kind = interaction.kind;
          if (kind !== 'question' && kind !== 'approval' && kind !== 'plan-review') return;
          // 同一 interaction 对象不重复通知；对象身份变化 = 新请求。
          if (prevPending.has(id) && prevPending.get(id) === interaction) return;
          var summary = byId ? byId[id] : null;
          if (summary && summary.origin === 'subagent' && !settings.subagents) return;
          var info = pendingInfo(kind);
          var detail = '';
          if (kind === 'question') {
            var qs = interaction.questions;
            if (Array.isArray(qs) && qs.length > 0) {
              var q = qs[0];
              var qtext = (q && typeof q === 'object') ? (q.question || q.text || '') : String(q);
              detail = truncate(qtext, 90);
            }
          } else if (kind === 'approval') {
            detail = interaction.reason || interaction.toolName || '';
          }
          var title = summary ? summary.displayTitle : String(id);
          sendSystemNotification(info.kind, info.title, detail !== '' ? title + ' · ' + detail : title, id);
          prevPending.set(id, interaction);
        });

        // 清理已从快照消失的会话，避免残留防重。
        var stale = [];
        prevPending.forEach(function (_, id) { if (!snap.has(id)) stale.push(id); });
        for (var i = 0; i < stale.length; i++) prevPending.delete(stale[i]);
      } catch (error) {
        console.warn('[dsh-notify-xc] pending change handling failed:', error);
      }
    }

    function resetBaseline() {
      // 断开重连后清空基线：下个快照作为新基线，避免重放断开期间的完成事件。
      prevRunning.clear();
      prevPending.clear();
    }

    // ------------------------------------------------------------------- apply
    var applied = false;

    exports.inject = ['slots', 'sessions', 'uiSession'];

    exports.apply = function apply(ctx) {
      if (applied) return;
      applied = true;
      ctxRef = ctx;
      try {
        // 1) 会话列表订阅（任务完成检测）。
        var sessions = ctx.sessions;
        if (sessions && sessions.list && typeof sessions.list.subscribe === 'function') {
          var unsubList = sessions.list.subscribe(handleListChange);
          ctx.effect(function () { return unsubList; }, 'dsh-notify-xc: sessions list');
        } else {
          console.warn('[dsh-notify-xc] sessions.list 服务不可用；任务完成通知关闭');
        }

        // 2) 待处理交互订阅（提问/批准/计划审阅）。
        var uiSession = ctx.get ? (ctx.get('uiSession') || ctx.uiSession) : ctx.uiSession;
        if (uiSession && uiSession.pendingInteractions && typeof uiSession.pendingInteractions.subscribe === 'function') {
          var unsubPending = uiSession.pendingInteractions.subscribe(handlePendingChange);
          ctx.effect(function () { return unsubPending; }, 'dsh-notify-xc: pending interactions');
        } else {
          console.warn('[dsh-notify-xc] uiSession.pendingInteractions 不可用；待处理交互通知关闭');
        }

        // 3) 连接重置清基线，避免重连后误报。
        try {
          ctx.on('connection/reset', resetBaseline);
        } catch (error) { /* ignore */ }

        // 4) 设置页（设置 → 任务提示，settings.section 一级页面）。
        if (ctx.slots && typeof ctx.slots.register === 'function') {
          try {
            var disposeSlot = ctx.slots.inject('settings.section', function () {
              return ctx.slots.register({
                name: 'settings.section',
                id: 'notify-xc',
                order: 131,
                label: function () { return '任务通知'; },
              }, SettingsCard);
            });
            ctx.effect(function () { return disposeSlot; }, 'dsh-notify-xc: settings section');
          } catch (error) {
            console.warn('[dsh-notify-xc] settings section registration failed:', error);
          }
        } else {
          console.warn('[dsh-notify-xc] slots 服务不可用；设置页不注册');
        }

        // 5) 建立基线 + 立即处理一次当前待处理交互（比如页面加载时已有未答问题）。
        handleListChange();
        handlePendingChange();

        // 6) 调试钩子：window.__dshNotifyXc.test() 弹测试通知并返回结果字符串。
        try {
          window.__dshNotifyXc = {
            version: BUNDLE_VERSION,
            settings: function () { return Object.assign({}, settings); },
            permission: function () { return systemPermission(); },
            test: function () { return sendTestNotification(); },
          };
        } catch (error) {
          console.warn('[dsh-notify-xc] debug hook install failed:', error);
        }
      } catch (error) {
        console.warn('[dsh-notify-xc] apply failed:', error);
      }
    };

    return module.exports;
  },
});
