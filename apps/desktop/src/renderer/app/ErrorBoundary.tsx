import { Component, type ReactNode } from 'react';

/** Last line of defence: log the crash locally and offer a reload instead of a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    void window.mncord?.log.error(`${error.stack ?? error.message}\n${info.componentStack ?? ''}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const ar = document.documentElement.lang === 'ar';
    return (
      <div className="grid h-full place-items-center bg-bg-deep p-6 text-center text-text">
        <div className="max-w-md">
          <p className="mb-2 font-display text-xl font-bold">{ar ? 'حدث خطأ غير متوقع' : 'Something broke'}</p>
          <p className="mb-6 text-muted">{ar ? 'سُجّل الخطأ على جهازك. أعد التحميل للمتابعة.' : 'The error was logged on your PC. Reload to keep going.'}</p>
          <button type="button" onClick={() => location.reload()} className="h-10 rounded-sm bg-accent px-5 font-semibold text-on-accent">{ar ? 'إعادة التحميل' : 'Reload'}</button>
        </div>
      </div>
    );
  }
}
