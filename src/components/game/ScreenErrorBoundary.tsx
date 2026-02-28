"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { captureException } from "@/lib/sentry";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  onRecover: () => void;
}

interface State {
  hasError: boolean;
}

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureException(error);
    console.error("ScreenErrorBoundary caught:", error, info.componentStack);
  }

  private handleRecover = () => {
    this.setState({ hasError: false });
    this.props.onRecover();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-6 text-center">
          <AlertTriangle size={40} className="text-amber-400" aria-hidden="true" />
          <h2 className="text-xl font-bold text-white">
            Something went wrong on this screen
          </h2>
          <p className="max-w-md text-sm text-zinc-400">
            An unexpected error occurred. Your game data is safe — autosave
            runs every week advance.
          </p>
          <Button onClick={this.handleRecover}>Return to Dashboard</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
