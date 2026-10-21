import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureReactException } from '../lib/sentry'

import { Button } from './ui/Button'
import { ErrorState } from './ui/ErrorState'
import { logger } from '../lib/logger'

interface ErrorBoundaryProps {
  children: ReactNode
  /** What to show instead; a function also gets a callback that tries rendering the children again. */
  fallback?: ReactNode | ((retry: () => void) => ReactNode)
}

interface ErrorBoundaryState {
  hasError: boolean
}

// React error boundaries must be class components; this is the single
// intentional exception to the functional-component convention.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // captureReactException preserves the React component stack in Sentry.
    captureReactException(error, info)
    if (import.meta.env.DEV) {
      logger.error('Unhandled UI error', {
        message: error.message,
        componentStack: info.componentStack,
      })
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (typeof this.props.fallback === 'function') {
      return this.props.fallback(this.handleReset)
    }

    if (this.props.fallback) {
      return this.props.fallback
    }

    return (
      <div className="ui-state-page">
        <ErrorState
          description="An unexpected error occurred while loading this page."
          action={<Button onClick={this.handleReset}>Try again</Button>}
        />
      </div>
    )
  }
}
