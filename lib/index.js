/**
 * dsh-notify-xc — host half（空）。
 *
 * 本插件是纯浏览器端能力：空 apply 仅为了让插件行出现在 host 的 cordis.yml /
 * Loader 中；浏览器侧通过 package.json 的 dsh.client 声明 + exports["./client"]
 * 加载（见 @deepseek-ai/dsh-client-modules 的 dsh.client 扫描机制）。
 *
 * 兼容性说明（相对 dsh-agent-notify 1.0.0，适配 DSH 0.1.2-alpha.4）：
 *   - 新版 DSH 中插件行不再是空 apply 之外的任何 host 行为；
 *   - 浏览器通知 / 设置页全部位于 lib/client.js。
 */

/** Host 插件体——本包在 host 侧不贡献任何功能。 */
export function apply() {}
