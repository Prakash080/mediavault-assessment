export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ApiErrorCode,
    public readonly retryAfter?: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get retryable(): boolean {
    return (
      this.code === 'NETWORK_ERROR' ||
      this.status === 429 ||
      this.status === 500 ||
      this.status === 502 ||
      this.status === 503 ||
      this.status === 504
    );
  }

  get userMessage(): string {
    switch (this.code) {
      case 'BAD_REQUEST':
        return 'The request could not be understood. Please refresh and try again.';

      case 'UNAUTHORIZED':
        return 'Your session is no longer valid. Please refresh the page.';

      case 'FORBIDDEN':
        return 'You do not have permission to perform this action.';

      case 'NOT_FOUND':
        return 'The requested asset could not be found.';

      case 'CONFLICT':
        return 'This asset was changed by someone else. Please reload the latest version before saving again.';

      case 'VALIDATION_ERROR':
        return 'Some of the information is invalid. Please review your changes and try again.';

      case 'RATE_LIMITED':
        return this.retryAfter
          ? `The service is temporarily busy. We will retry shortly.`
          : 'The service is temporarily busy. Please try again shortly.';

      case 'SERVER_ERROR':
        return 'The server is temporarily unavailable. We will retry automatically.';

      case 'NETWORK_ERROR':
        return 'Unable to reach the server. Check your connection and try again.';

      default:
        return 'Something went wrong. Please try again.';
    }
  }
}