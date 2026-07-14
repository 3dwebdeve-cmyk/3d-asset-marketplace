import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from './ui/Button'
import { ErrorState } from './ui/ErrorState'
import { logger } from '../lib/logger'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
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
    logger.error('Unhandled UI error', {
      message: error.message,
      componentStack: info.componentStack,
    })
  }

  handleReset = (): void => {
    this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
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
