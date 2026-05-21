import React from 'react';

/**
 * Top-level error boundary.
 * Catches render-time JS errors and shows a recovery UI.
 * Does NOT catch async errors (use try/catch in effects and handlers).
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.setState({ componentStack: errorInfo?.componentStack });
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || 'Unknown error';
      const isDev = process.env.NODE_ENV === 'development';

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-8 grid-bg">
          <div className="max-w-lg w-full glass-panel border border-red-500/30 p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-red-500/20 pb-4">
              <div className="w-8 h-8 border border-red-500/50 bg-red-500/10 flex items-center justify-center">
                <span className="text-red-400 font-mono font-bold text-sm">!</span>
              </div>
              <div>
                <h1 className="text-sm font-mono font-bold text-red-400 uppercase tracking-widest">
                  Render Error
                </h1>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  A component encountered an unexpected error
                </p>
              </div>
            </div>

            {/* Error message */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Error</p>
              <div className="p-3 bg-black/60 border border-red-500/20 overflow-auto max-h-24">
                <code className="text-xs text-red-400 font-mono break-all">{message}</code>
              </div>
            </div>

            {/* Component stack — dev only */}
            {isDev && this.state.componentStack && (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Stack</p>
                <pre className="text-[9px] text-muted-foreground font-mono overflow-auto max-h-32 p-2 bg-black/40 border border-white/5 leading-relaxed whitespace-pre-wrap">
                  {this.state.componentStack.trim()}
                </pre>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => this.setState({ hasError: false, error: null, componentStack: null })}
                className="flex-1 py-2 border border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 font-mono text-xs text-primary uppercase tracking-widest transition-all"
              >
                Retry
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                className="flex-1 py-2 border border-white/10 hover:border-white/20 bg-black/20 font-mono text-xs text-muted-foreground uppercase tracking-widest transition-all"
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
