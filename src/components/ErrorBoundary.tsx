import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error) errorMessage = parsed.error;
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full space-y-6">
            <div className="mx-auto bg-red-50 p-4 rounded-full w-fit">
              <AlertTriangle className="w-12 h-12 text-red-600" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-neutral-900">Something went wrong</h1>
              <p className="text-neutral-500">{errorMessage}</p>
            </div>
            <Button 
              onClick={() => window.location.reload()} 
              className="bg-neutral-900 text-white gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
