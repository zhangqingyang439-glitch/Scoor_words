/** 桌面单文件版用的 PWA 注册桩：file:// 下没有 Service Worker，静默跳过 */
export function registerSW(_options?: Record<string, unknown>) {
  return () => {}
}
