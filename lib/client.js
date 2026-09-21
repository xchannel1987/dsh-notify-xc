/**
 * dsh-notify-xc — 浏览器端 bundle（手写，无构建步骤）
 *
 * 功能（继承 dsh-agent-notify 的行为，扩展三类可配置通知）：
 *   1. 订阅会话列表 store（ctx.sessions.list），会话 running:true -> false 时：
 *      - 本轮以 turn-error 结束 → "运行出错" 系统通知；
 *      - 否则 → "任务完成" 系统通知（完成/出错互斥）。
 *      - 但 "running 变 false" ≠ "任务结束"：主会话派出后台子代理 / 代理类 job 后会让出
 *        回合（agent 驱动停下等结果投递），此时会话并没有结束，不该通知。故完成判定
 *        先过两道闸（settings.waitForBackground，默认开）：
 *          a) hasLiveBackgroundWork —— 该会话仍有在跑的子代理（含孙代理）或未结束的
 *             代理类后台任务（subagent / workflow / ralph / goal job）→ 挂起
 *             （heldForWork），等这些活结束再判一次；后台 shell 任务（常驻 dev server
 *             之类）不参与判定，否则会吞掉通知；
 *          b) DONE_GRACE_MS 宽限期 —— 到点重读快照，若期间会话又 running（被结果唤醒）
 *             或新派出后台活，则这次让出根本不算完成，不发通知。
 *   2. 订阅待处理交互 store（ctx.uiSession.pendingInteractions），agent 发起提问
 *      / 批准 / 计划审阅时发 "需要你的输入/批准/审阅" 系统通知。
 *   3. 点击系统通知：聚焦页面 + 打开对应会话（ctx.sessions.open）。
 *   4. 通知带 DSH 官方图标（/favicon.svg）；"需要输入"通知在 settings.persist
 *      开启时常驻（requireInteraction，不自动消失直到你处理）。
 *   5. settings.showWorkspace 开启时，通知标题前缀 [工作区名]（从会话 cwd 提取）。
 *   6. 设置页注册进官方设置的一级页面（settings.section slot → 设置 → 任务通知）：
 *      三类通知各自开关（任务完成 / 需要输入 / 运行出错）+ 包含子代理 +
 *      等子代理 / 工作流时不通知（waitForBackground）+
 *      需要输入通知常驻 / 通知显示工作区归属 / 系统通知模式（不发送/后台时发送/
 *      始终发送，三类共享）/ 权限状态 / 测试按钮（标题栏右对齐）。设置持久化在
 *      localStorage（dsh.notifyXc.settings.v2，自动迁移旧 v1）。
 *   7. 首次用户手势自动请求通知权限；调试钩子 window.__dshNotifyXc。
 *   8. 移动端能力检测：iOS 的系统通知仅支持 Service Worker Web Push（本插件基于本地
 *      new Notification()，未接入该机制，iOS 上弹不出通知）；Android WebView / App
 *      内置浏览器不支持 —— 一律判定为「不支持」并置灰设置页（iOS 16.4+ 里 Notification
 *      API 虽存在但无法授权/不弹通知，不能误报「已拒绝」）。
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

    try {
      console.log('[dsh-notify-xc] bundle loaded')
    } catch (error) { /* ignore */ }

    // ---------------------------------------------------------------- settings
    // 通知类型开关：done 任务完成 / input 需要输入 / error 运行出错。
    var SETTINGS_KEY = 'dsh.notifyXc.settings.v2';
    var LEGACY_SETTINGS_KEY = 'dsh.notifyXc.settings.v1';
    var DEFAULT_SETTINGS = {
      done: true,
      input: true,
      error: true,
      subagents: false,
      // 会话在等自己派出的子代理 / 代理类后台任务时不发「任务完成」：那只是让出回合，
      // 不是结束。关掉本项即恢复旧行为（每次 running true->false 都通知）。
      waitForBackground: true,
      // 系统通知（浏览器 Notification API）：off 不发送；background 仅页面隐藏时
      // 发送（你在别的窗口）；always 每个事件都发送。三类通知共享该模式。
      system: 'always',
      // 需要输入通知常驻：requireInteraction，审批/提问不自动消失直到你处理。
      persist: true,
      // 通知显示工作区归属：正文标题前缀 [工作区名]。
      showWorkspace: true,
    };

    /** 从 localStorage 读取设置，v1 自动迁移到 v2。 */
    function loadSettings() {
      var base = Object.assign({}, DEFAULT_SETTINGS);
      try {
        var raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) {
          // v1 迁移：旧 enabled 主开关映射到三类开关。
          var legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
          if (legacy) {
            var old = JSON.parse(legacy);
            if (typeof old.enabled === 'boolean') {
              base.done = old.enabled;
              base.input = old.enabled;
              base.error = old.enabled;
            }
            if (typeof old.subagents === 'boolean') base.subagents = old.subagents;
            if (old.system === 'off' || old.system === 'background' || old.system === 'always') {
              base.system = old.system;
            }
            try { localStorage.removeItem(LEGACY_SETTINGS_KEY); } catch (e) { /* ignore */ }
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(base));
          }
          return base;
        }
        var parsed = JSON.parse(raw);
        if (typeof parsed.done === 'boolean') base.done = parsed.done;
        if (typeof parsed.input === 'boolean') base.input = parsed.input;
        if (typeof parsed.error === 'boolean') base.error = parsed.error;
        if (typeof parsed.subagents === 'boolean') base.subagents = parsed.subagents;
        if (typeof parsed.waitForBackground === 'boolean') base.waitForBackground = parsed.waitForBackground;
        if (parsed.system === 'off' || parsed.system === 'background' || parsed.system === 'always') {
          base.system = parsed.system;
        }
        if (typeof parsed.persist === 'boolean') base.persist = parsed.persist;
        if (typeof parsed.showWorkspace === 'boolean') base.showWorkspace = parsed.showWorkspace;
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
      // 标题栏：标题 + spacer(flex:1) + 右对齐按钮（对齐 dsh-token-usage-xc 刷新按钮布局）。
      head: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 },
      spacer: { flex: 1, minWidth: 8 },
      btn: { appearance: "none", font: "inherit", cursor: "pointer", color: "var(--dsw-alias-label-secondary, #61666b)", background: "color-mix(in srgb, var(--dsw-alias-bg-base, #ffffff) 50%, transparent)", border: "1px solid color-mix(in srgb, var(--dsw-alias-border-l2, rgba(0,0,0,0.12)) 55%, transparent)", borderRadius: "6px", padding: "3px 11px", fontSize: "12px", lineHeight: "18px", display: "inline-flex", alignItems: "center", gap: "4px" },
      permBadge: { fontSize: "12px", lineHeight: "18px", whiteSpace: "nowrap" },
      disabled: { opacity: 0.5, cursor: "default" },
      disabledBtn: { opacity: 0.5, cursor: "default" },
    }

    function truncate(text, max) {
      if (text.length <= max) return text;
      return text.slice(0, max - 1).trimEnd() + '…';
    }

    /**
     * 从工作区目录路径取末段作为显示名（与 DSH 官方 workspaceTitleOf 同逻辑，
     * 兼容 POSIX / Windows 分隔符）。
     */
    function workspaceTitleOf(path) {
      var trimmed = path.replace(/[/\\]+$/, '');
      var separator = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
      return trimmed.slice(separator + 1);
    }

    /**
     * 组装通知标题：settings.showWorkspace 开启且会话有 cwd 时，前缀 [工作区名]。
     * @param {string} sessionTitle - 会话显示标题。
     * @param {object} summary - sessions.list byId 里的会话摘要（含 cwd）。
     */
    function notifyTitle(sessionTitle, summary) {
      if (settings.showWorkspace !== true || !summary || typeof summary.cwd !== 'string' || summary.cwd === '') {
        return sessionTitle;
      }
      var ws = workspaceTitleOf(summary.cwd);
      return ws !== '' ? '[' + ws + '] ' + sessionTitle : sessionTitle;
    }

    // ------------------------------------------- system-level notifications
    var SYSTEM_MODES = {
      off: '不发送',
      background: '后台时发送',
      always: '始终发送',
    };

    // ------------------------------------------------------ mobile capability
    // 移动端能力检测（落实 0.2.0「移动端置灰」设计）：
    //   - iOS（iPhone/iPad/iPadOS）：系统通知 = Service Worker Web Push（需 HTTPS
    //     + 添加到主屏幕 + 网站注册 Service Worker），本插件基于本地
    //     `new Notification()`，在 iOS 上即使授权成功也不会弹出；普通标签页里
    //     requestPermission 更是恒为 default / 被拒 —— 旧实现会误显示「已拒绝」。
    //   - Android WebView / 微信、QQ、钉钉、飞书等 App 内置浏览器：通知权限被宿主
    //     强制禁用，页面内无法授权。
    // 上述环境一律判定为「不支持」→ 设置页置灰，而不是误导用户去处理「已拒绝」。
    function isIOSDevice() {
      try {
        var ua = navigator.userAgent || '';
        if (/iPhone|iPad|iPod/i.test(ua)) return true;
        // iPadOS 13+ 上报桌面 UA（Macintosh 平台）：需触屏能力佐证。
        var isMacish = /Mac/i.test(navigator.platform || '') || /Mac OS X/.test(ua);
        if (!isMacish) return false;
        return navigator.maxTouchPoints > 1 || 'ontouchstart' in window || 'ontouchend' in document;
      } catch (error) { return false; }
    }

    /** Android WebView / 各 App 内置浏览器（通知被宿主禁用）。 */
    function isWebView() {
      try {
        var ua = navigator.userAgent || '';
        return /; wv[);]/i.test(ua)
          || /MicroMessenger|wxwork|\bQQ\/|DingTalk|Feishu|Lark/i.test(ua);
      } catch (error) { return false; }
    }

    function systemNotificationSupported() {
      if (typeof window === 'undefined' || !('Notification' in window)) return false;
      // iOS：本插件的本地 new Notification() 弹不出通知（系统通知需 Service Worker
      // Web Push，DSH 未注册 SW），一律按不支持处理。
      if (isIOSDevice()) return false;
      if (isWebView()) return false;
      return true;
    }

    /** 不支持时的提示文案：按具体环境分场景说明。 */
    function unsupportedHint() {
      var apiExists = typeof window !== 'undefined' && 'Notification' in window;
      if (apiExists && isWebView()) {
        return '当前环境（App 内置浏览器）不支持系统通知，请改用浏览器 App 打开本页面。';
      }
      if (apiExists && isIOSDevice()) {
        return 'iOS 系统通知仅支持 Service Worker Web Push（HTTPS + 添加到主屏幕），本插件未接入该机制，请用桌面 Edge / Chrome。';
      }
      if (!apiExists) {
        return '当前浏览器不支持系统通知，本插件不可用（需桌面 Edge / Chrome，并以 https:// 或 127.0.0.1 访问）。';
      }
      return '当前浏览器不支持系统通知，本插件不可用（请用桌面 Edge / Chrome）。';
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

    /**
     * 当前设置是否要为该类型事件发系统通知。
     * @param {string} type - 通知类型：'done' | 'input' | 'error'（开关控制）；
     *   'system'（系统提示，如授权成功）不受类型开关限制。
     */
    function shouldSendSystemNotification(type) {
      if (type !== 'system' && settings[type] !== true) return false;
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
    /** DSH 官方图标（web 根路径下的 favicon.svg，静态资源无需鉴权）。 */
    function notifyIcon() {
      try {
        return (window.location ? window.location.origin : '') + '/favicon.svg';
      } catch (error) {
        return '/favicon.svg';
      }
    }

    function sendSystemNotification(type, title, detail, sessionId) {
      if (!shouldSendSystemNotification(type)) return;
      if (systemPermission() !== 'granted') return;
      try {
        var body = detail && detail !== '' ? detail : title;
        var notification = new window.Notification(title, {
          body: truncate(body, 200),
          icon: notifyIcon(),
          // 需要输入通知常驻：requireInteraction 让气泡停在通知中心直到用户处理。
          requireInteraction: type === 'input' && settings.persist === true,
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
      if (systemPermission() === 'denied') return '权限被拒绝：请在浏览器「网站设置」里允许本网站的通知';
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
          sendSystemNotification('system', '系统通知已授权', '任务完成时将弹出系统级通知');
        }
      }).catch(function () { /* ignore */ });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', maybeAskPermission, { passive: true });
      document.addEventListener('keydown', maybeAskPermission, { passive: true });
    }

    // ------------------------------------------------------------------- card
    /**
     * 设置页：注册进官方 settings.section slot（设置 → 任务通知）。
     * 纯 createElement 构建，无 JSX 无需构建步骤；读写 bundle 级 settings 并持久化
     * localStorage，组件 state 仅驱动重渲染。
     */
    function SettingsCard() {
      var state = React.useState(function () {
        return {
          done: settings.done,
          input: settings.input,
          error: settings.error,
          subagents: settings.subagents,
          waitForBackground: settings.waitForBackground,
          system: settings.system,
          persist: settings.persist,
          showWorkspace: settings.showWorkspace,
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

      // 当前浏览器是否支持系统通知（iOS 仅支持 Service Worker Web Push 而未接入、
      // WebView / App 内置浏览器不支持 —— 见 systemNotificationSupported()）。
      var supported = systemNotificationSupported();

      var permLabel =
        value.perm === 'granted' ? '已授权' :
        value.perm === 'denied' ? '已拒绝' :
        value.perm === 'unsupported' ? '不支持' :
        !supported ? '不支持' : '未授权';

      var permColor =
        value.perm === 'granted' ? 'var(--dsw-alias-state-success-primary, #1a7f37)' :
        (value.perm === 'denied' || !supported) ? 'var(--dsw-alias-state-error-primary, #d93026)' : 'inherit';

      // 不支持通知时整卡置灰：禁用所有开关、下拉与按钮。
      var rowDisabled = !supported;
      var cardStyle = supported ? st.card : Object.assign({}, st.card, st.disabled);

      var checkRow = function (key, label) {
        return e('label', { style: st.row, key: key },
          e('input', { type: 'checkbox', style: st.check, checked: value[key], disabled: rowDisabled, onChange: function (ev) { update(patchObj(key, ev.target.checked)); } }),
          e('span', { style: st.hint }, label)
        );
      };
      var patchObj = function (key, v) { var o = {}; o[key] = v; return o; };

      return e('div', { style: cardStyle },
        e('div', { style: st.head },
          e('h3', { style: st.title }, '任务通知 (dsh-notify-xc)'),
          e('span', { style: st.spacer }),
          e('span', { style: Object.assign({}, st.permBadge, { color: permColor, marginRight: '4px' }) }, permLabel),
          e('button', { type: 'button', style: rowDisabled ? Object.assign({}, st.btn, st.disabledBtn) : st.btn, disabled: rowDisabled, onClick: function () {
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
        e('p', { style: st.desc }, 'agent 完成任务或需要操作时弹出系统通知，点击气泡直达会话。'),
        !supported ? e('p', { style: Object.assign({}, st.hint, { color: 'var(--dsw-alias-state-error-primary, #d93026)' }) }, unsupportedHint()) : null,
        checkRow('done', '任务完成通知'),
        checkRow('input', '需要输入通知'),
        checkRow('error', '运行出错通知'),
        checkRow('subagents', '包含子代理通知'),
        checkRow('waitForBackground', '等子代理 / 工作流时不通知'),
        checkRow('persist', '需要输入通知常驻'),
        checkRow('showWorkspace', '通知显示工作区归属'),
        e('label', { style: st.row },
          e('span', { style: { flex: 'none', fontSize: '13px', lineHeight: '20px', color: 'var(--dsw-alias-label-secondary, #61666b)' } }, '系统通知'),
          e('select', { style: st.select, value: value.system, disabled: rowDisabled, onChange: function (ev) { update(patchObj('system', ev.target.value)); } },
            Object.keys(SYSTEM_MODES).map(function (mode) { return e('option', { value: mode, key: mode }, SYSTEM_MODES[mode]); }))
        ),
        !supported ? null : (value.perm === 'denied' ? e('p', { style: Object.assign({}, st.hint, { color: 'var(--dsw-alias-state-error-primary, #d93026)' }) }, '通知权限被拒绝：请在浏览器「网站设置」里允许本网站的通知') : null),
        value.lastTest ? e('p', { style: st.hint }, value.lastTest) : null
      );
    }

    // --------------------------------------------------------------- detection
    // 任务完成检测：sessionId -> { running } 基线，running true->false 触发通知。
    var prevRunning = new Map();
    // 待处理交互检测：sessionId -> interaction 对象（对象身份变化即新请求）。
    var prevPending = new Map();
    // 挂起表：running 已 false 但仍在等子代理 / 代理类 job 的会话；这些活结束后补判一次。
    var heldForWork = new Set();
    // 完成通知宽限定时器：sessionId -> timer（见 DONE_GRACE_MS 的用途）。
    var doneTimers = new Map();
    // 宽限期：running true->false 后先等这么久再判定要不要通知。躲开「子代理刚跑完、
    // 结果已排队、父会话马上被唤醒继续」这类瞬时 false 边沿——那一瞬间列表里看不到
    // 任何在跑的活，立刻通知就是误报。
    var DONE_GRACE_MS = 1200;
    // 「代理类」背景任务才算这轮还没跑完：子代理 / 工作流 / Ralph / goal 都会跑完就结束，
    // 结束时把父会话唤醒。shell 类（pwsh / bash 后台任务）不算——常驻的 dev server 也长这样，
    // 拿它压住完成通知等于把通知永久吞掉。
    var DELEGATION_JOB_KINDS = { subagent: true, agent: true, workflow: true, ralph: true, goal: true };
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
    /**
     * 取会话最后一条 assistant 回复的前 90 字。
     * 注意：当前 session snapshot 不包含 nodes 字段，此函数暂时返回空字符串。
     * 未来可通过 projection 系统或事件窗口访问聊天节点时再实现。
     */
    function lastAssistantText(sessionId) {
      // 当前 session snapshot 不包含聊天节点，返回空字符串
      // 未来可通过 binding.session.projections.faceOf('assistant-step') 访问
      return '';
    }

    /**
     * 获取会话最后一个 turn/end 事件的信息。
     * 优先通过 session snapshot 的 lastAgentError 字段读取（粗糙但稳定），
     * 降级到空字符串。
     * @returns {{ kind: string, error?: string }} 或 null
     */
    function getLastTurnEnd(sessionId) {
      try {
        var sessions = ctxRef && ctxRef.sessions;
        if (!sessions || typeof sessions.binding !== 'function') return null;
        var binding = sessions.binding(sessionId);
        if (!binding || !binding.session || typeof binding.session.getSnapshot !== 'function') return null;
        var snap = binding.session.getSnapshot();
        if (!snap) return null;
        
        // 使用 lastAgentError 字段检测错误（session 级别的错误）
        if (snap.lastAgentError && typeof snap.lastAgentError === 'string') {
          return { kind: 'error', error: snap.lastAgentError };
        }
        
        // 默认返回 completed（正常完成）
        return { kind: 'completed' };
      } catch (error) {
        console.warn('[dsh-notify-xc] turn-end read failed:', error);
      }
      return null;
    }

    /**
     * 检测会话是否以「运行出错」结束：通过 lastAgentError 字段检测。
     * @returns {string} 错误信息摘要；无错误返回 ''。
     */
    function lastTurnError(sessionId) {
      var turnEnd = getLastTurnEnd(sessionId);
      if (turnEnd && turnEnd.kind === 'error' && turnEnd.error) {
        return truncate(turnEnd.error, 90);
      }
      return '';
    }

    /** 读一次会话列表快照（未 ready / 不可用返回 null）。 */
    function readListSnapshot() {
      try {
        var sessions = ctxRef && ctxRef.sessions;
        if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== 'function') return null;
        var snap = sessions.list.getSnapshot();
        if (!snap || snap.phase !== 'ready') return null;
        return snap;
      } catch (error) { return null; }
    }

    /**
     * 该会话是否还有「后台在跑的活」：未结束的子代理（含更深层级）或代理类后台 job。
     * 命中即说明 running true->false 只是 agent 让出回合等结果，会话并没有结束。
     * 三个数据源都是会话列表快照自带的字段，不需要额外订阅或远程调用：
     *   - byId 行：子代理会话是宿主直列会话，带 origin:'subagent' + parentId + running；
     *   - jobsBySession：后台任务列表，只认 kind ∈ DELEGATION_JOB_KINDS（子代理 / 工作流
     *     / Ralph / goal）且 status 为 running / stopping 的那些；shell 类后台任务不算
     *     （常驻服务会一直 running，用它压通知等于永久不通知）；
     *   - subagentsByParent：子代理目录（侧边栏展开过该父会话才会加载），条目 activity
     *     为权威运行态，用来补列表没收录的行。
     */
    function hasLiveBackgroundWork(snap, sessionId) {
      if (!snap || typeof sessionId !== 'string') return false;
      try {
        var byId = snap.byId || {};
        var jobs = snap.jobsBySession || {};
        var catalogs = snap.subagentsByParent || {};
        var queue = [sessionId];
        var seen = new Set();
        while (queue.length > 0 && seen.size < 500) {
          var id = queue.pop();
          if (seen.has(id)) continue;
          seen.add(id);
          var jobList = jobs[id];
          if (Array.isArray(jobList)) {
            for (var i = 0; i < jobList.length; i++) {
              var job = jobList[i];
              var jobKind = job && job.kind;
              if (!jobKind || DELEGATION_JOB_KINDS[jobKind] !== true) continue;
              var status = job.status;
              if (status === 'running' || status === 'stopping') return true;
            }
          }
          for (var key in byId) {
            if (!Object.prototype.hasOwnProperty.call(byId, key)) continue;
            var row = byId[key];
            if (!row || row.parentId !== id) continue;
            if (row.running === true) return true;
            queue.push(key);
          }
          var catalog = catalogs[id];
          var entries = catalog && Array.isArray(catalog.entries) ? catalog.entries : null;
          if (entries) {
            for (var j = 0; j < entries.length; j++) {
              var entry = entries[j];
              if (!entry || entry.kind !== 'child') continue;
              if (entry.activity === 'running') return true;
              if (typeof entry.id === 'string' && entry.id !== '') queue.push(entry.id);
            }
          }
        }
      } catch (error) {
        console.warn('[dsh-notify-xc] background work probe failed:', error);
      }
      return false;
    }

    /** 取消某会话尚未发出的完成判定。 */
    function clearDoneTimer(sessionId) {
      var timer = doneTimers.get(sessionId);
      if (timer === undefined) return;
      try { clearTimeout(timer); } catch (error) { /* ignore */ }
      doneTimers.delete(sessionId);
    }

    function clearAllDoneTimers() {
      for (var id of Array.from(doneTimers.keys())) clearDoneTimer(id);
    }

    /** 发出「任务完成 / 运行出错」通知（两者互斥，此刻已确认会话真的停下来了）。 */
    function fireCompletionNotice(sessionId, summary) {
      var title = notifyTitle(summary.displayTitle || sessionId, summary);
      var turnEnd = getLastTurnEnd(sessionId);
      var kind = turnEnd ? turnEnd.kind : 'completed';
      
      if (kind === 'error') {
        var errorMsg = turnEnd.error || '运行失败';
        sendSystemNotification('error', '运行出错', title + ' · ' + truncate(errorMsg, 90), sessionId);
        return;
      }
      
      // 对于 completed / interrupted / aborted / max-tokens / blocked 等情况，都发送"任务完成"通知
      // 注意：当前 session snapshot 不包含 turn 结束原因的详细信息，
      // 所以无法区分"用户主动中断"和"正常完成"。
      // 未来可通过 projection 系统或事件窗口访问 turn/end 事件时再细化。
      var summaryText = lastAssistantText(sessionId);
      var detail = summaryText !== '' ? title + ' · ' + summaryText : title;
      sendSystemNotification('done', '任务完成', detail, sessionId);
    }

    /** 宽限期到点后再判一次：仍停着、且没有后台工作在跑，才真的发通知。 */
    function settleCompletionNotice(sessionId) {
      var snap = readListSnapshot();
      var summary = snap && snap.byId ? snap.byId[sessionId] : null;
      if (!summary) return;                  // 会话已不在列表（被删/不可见）：不通知
      if (summary.running === true) return;  // 期间又被唤醒：那次 false 只是让出回合
      if (settings.waitForBackground === true && hasLiveBackgroundWork(snap, sessionId)) {
        heldForWork.add(sessionId);          // 还在等子代理 / 代理类 job：挂起，结束后再判
        return;
      }
      heldForWork.delete(sessionId);
      fireCompletionNotice(sessionId, summary);
    }

    /** 排定一次延迟判定（同一会话只保留最新一个定时器）。 */
    function scheduleCompletionNotice(sessionId) {
      clearDoneTimer(sessionId);
      var timer;
      try {
        timer = setTimeout(function () {
          doneTimers.delete(sessionId);
          settleCompletionNotice(sessionId);
        }, DONE_GRACE_MS);
      } catch (error) {
        settleCompletionNotice(sessionId);
        return;
      }
      doneTimers.set(sessionId, timer);
    }

    /** 会话列表变化：running true->false = 任务完成 / 运行出错（等后台工作的让出不算）。 */
    function handleListChange() {
      try {
        var snap = readListSnapshot();
        if (!snap) return;
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
          if (nowRunning) {
            // 会话又在跑了：之前那次 false 是让出回合，撤掉待发的完成通知。
            clearDoneTimer(id);
            heldForWork.delete(id);
          }
          if (was === undefined) {
            // 首个快照（页面加载/重连基线）：只记录，不重放历史完成。
            prevRunning.set(id, { running: nowRunning });
            continue;
          }
          if (was.running && !nowRunning) {
            if (settings.waitForBackground === true && hasLiveBackgroundWork(snap, id)) {
              // 主会话派出后台子代理 / 代理类 job 还没跑完：会话没真的结束，不发通知，
              // 挂起等这些活全部结束（见下面的 heldForWork 复查）。
              heldForWork.add(id);
            } else {
              scheduleCompletionNotice(id);
            }
          }
          prevRunning.set(id, { running: nowRunning });
        }
        // 挂起中的会话：子代理 / 代理类 job 一旦全部结束，补一次完成判定。
        if (heldForWork.size > 0) {
          for (var heldId of Array.from(heldForWork)) {
            var heldSummary = byId[heldId];
            if (!heldSummary) { heldForWork.delete(heldId); continue; }
            if (heldSummary.running === true) { heldForWork.delete(heldId); continue; }
            if (hasLiveBackgroundWork(snap, heldId)) continue;
            heldForWork.delete(heldId);
            scheduleCompletionNotice(heldId);
          }
        }
        for (var key of Array.from(prevRunning.keys())) {
          if (!(key in byId)) prevRunning.delete(key);
        }
        for (var goneId of Array.from(doneTimers.keys())) {
          if (!(goneId in byId)) clearDoneTimer(goneId);
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
          var title = summary ? notifyTitle(summary.displayTitle || id, summary) : String(id);
          sendSystemNotification('input', info.title, detail !== '' ? title + ' · ' + detail : title, id);
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
      clearAllDoneTimers();
      heldForWork.clear();
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
          ctx.effect(function () {
            clearAllDoneTimers();
            heldForWork.clear();
            return unsubList;
          }, 'dsh-notify-xc: sessions list');
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

        // 4) 设置页（设置 → 任务通知，settings.section 一级页面）。
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
            settings: function () { return Object.assign({}, settings); },
            permission: function () { return systemPermission(); },
            test: function () { return sendTestNotification(); },
            // 排查「为什么没弹通知」：看该会话是否被判为仍在等后台工作 / 已挂起。
            probe: function (sessionId) {
              var snap = readListSnapshot();
              var summary = snap && snap.byId ? snap.byId[sessionId] : null;
              return {
                snapshot: snap ? 'ready' : 'unavailable',
                running: summary ? summary.running === true : null,
                backgroundWork: snap ? hasLiveBackgroundWork(snap, sessionId) : null,
                heldForWork: heldForWork.has(sessionId),
                pendingTimer: doneTimers.has(sessionId),
              };
            },
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