import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : 'Unexpected error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('COSMICARE UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="min-h-screen flex items-center justify-center bg-background p-8">
          <div className="max-w-md text-center space-y-3">
            <h1 className="text-2xl font-serif text-warm-ivory">Something went wrong</h1>
            <p className="text-muted-silver text-sm">
              The COSMICARE interface hit an unexpected error. Reload the page to continue; mission safety
              monitoring is unaffected.
            </p>
            {this.state.message && (
              <p className="text-xs text-muted-silver/60 font-mono break-all">{this.state.message}</p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-celestial-blue hover:underline text-sm"
            >
              Reload
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
