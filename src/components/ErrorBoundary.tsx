import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-white rounded-xl border border-rose-200 shadow-sm text-center space-y-4 max-w-lg mx-auto my-8">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h2 className="text-lg font-bold text-slate-800">
            {this.props.fallbackTitle || 'Something went wrong displaying this view'}
          </h2>
          <p className="text-xs text-slate-500 font-mono bg-slate-50 p-3 rounded border border-slate-200 text-left overflow-x-auto max-h-32">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            {this.props.onReset ? (
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  this.props.onReset?.();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-blue-700 transition-colors"
              >
                Close & Return
              </button>
            ) : (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-blue-700 transition-colors"
              >
                Reload Page
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

