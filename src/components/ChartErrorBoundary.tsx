import React, { Component, ErrorInfo, ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  height?: number | string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChartErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('Chart rendering fallback activated:', error.message, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="w-full flex flex-col items-center justify-center p-6 text-center rounded-xl border border-neutral-200/60 bg-neutral-50/50 text-neutral-400"
          style={{ height: this.props.height || '260px' }}
        >
          <BarChart3 className="w-8 h-8 text-neutral-300 mb-2 stroke-[1.5]" />
          <p className="text-xs font-semibold text-neutral-600">
            {this.props.fallbackMessage || 'Disbursement Chart'}
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Chart data visualization temporarily rendered in safe mode.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
