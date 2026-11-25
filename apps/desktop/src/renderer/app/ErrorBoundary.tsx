import { Component, type ReactNode } from 'react';

/**
 * Last line of defence: log the crash locally and recover. `area` boundaries wrap one part of the window
 * (sidebar, chat, member list…) so a problem there shows a small "try again" box instead of taking down the
 * whole app, and they reset by themselves when you navigate (resetKey changes).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; area?: string; resetKey?: unknown }, { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { error: Error | null; key: unknown }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    void window.mncord?.log.error(`[${this.props.area ?? 'app'}] ${error.stack ?? error.message}\n${info.componentStack ?? ''}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const ar = document.documentElement.lang === 'ar';
    if (this.props.area)
      return (
        <div role="alert" className="grid flex-1 place-items-center p-4 text-center">
          <div className="max-w-xs">
            <p className="font-semibold text-text">{ar ? 'صار خطأ في هذا الجزء' : 'This part hit a snag'}</p>
            <p className="mt-1 break-words text-xs text-faint">{this.state.error.message}</p>
            <button type="button" onClick={() => this.setState({ error: null })} className="mt-3 h-8 rounded-sm bg-accent px-4 text-sm font-semibold text-on-accent">{ar ? 'حاول مرة ثانية' : 'Try again'}</button>
          </div>
        </div>
      );
    return (
      <div className="grid h-full place-items-center bg-bg-deep p-6 text-center text-text">
        <div className="max-w-md">
          <p className="mb-2 font-display text-xl font-bold">{ar ? 'حدث خطأ غير متوقع' : 'Something broke'}</p>
          <p className="mb-2 text-muted">{ar ? 'سُجّل الخطأ على جهازك. أعد التحميل للمتابعة.' : 'The error was logged on your PC. Reload to keep going.'}</p>
          <p className="mb-6 break-words font-mono text-xs text-faint">{this.state.error.message}</p>
          <button type="button" onClick={() => location.reload()} className="h-10 rounded-sm bg-accent px-5 font-semibold text-on-accent">{ar ? 'إعادة التحميل' : 'Reload'}</button>
        </div>
      </div>
    );
  }
}
