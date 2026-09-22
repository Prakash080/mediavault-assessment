import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  Props,
  State
> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(
    error: Error,
  ): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(
    error: Error,
    errorInfo: ErrorInfo,
  ) {
    console.error(
      'MediaVault application error:',
      error,
      errorInfo,
    );
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
          }}
        >
          <section
            style={{
              width: 'min(560px, 100%)',
              padding: '24px',
              border: '1px solid #d9dce1',
              borderRadius: '8px',
              background: '#ffffff',
            }}
          >
            <h1>Something went wrong</h1>

            <p
              style={{
                color: '#62676f',
                marginBottom: '16px',
              }}
            >
              MediaVault encountered an unexpected
              error. Please reload the application
              and try again.
            </p>

            {this.state.error?.message && (
              <pre
                style={{
                  overflowX: 'auto',
                  padding: '12px',
                  background: '#f5f6f8',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                {this.state.error.message}
              </pre>
            )}

            <button
              type="button"
              onClick={this.handleReload}
            >
              Reload application
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;