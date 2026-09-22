import type {
  Asset,
  AssetPage,
  AssetQuery,
  BulkResult,
} from '@/lib/types';

import {
  ApiError,
  type ApiErrorCode,
} from './errors';

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5_000;
const MAX_JITTER_MS = 250;

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();

  if (query.q) {
    params.set('q', query.q);
  }

  if (query.status?.length) {
    params.set('status', query.status.join(','));
  }

  if (query.kind?.length) {
    params.set('kind', query.kind.join(','));
  }

  if (query.tag?.length) {
    params.set('tag', query.tag.join(','));
  }

  if (query.collectionId) {
    params.set('collectionId', query.collectionId);
  }

  if (query.owner) {
    params.set('owner', query.owner);
  }

  if (query.sort) {
    params.set('sort', query.sort);
  }

  if (query.limit) {
    params.set('limit', String(query.limit));
  }

  if (query.cursor) {
    params.set('cursor', query.cursor);
  }

  return params.toString();
}

function getErrorCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';

    case 401:
      return 'UNAUTHORIZED';

    case 403:
      return 'FORBIDDEN';

    case 404:
      return 'NOT_FOUND';

    case 409:
      return 'CONFLICT';

    case 422:
      return 'VALIDATION_ERROR';

    case 429:
      return 'RATE_LIMITED';

    default:
      if (status >= 500) {
        return 'SERVER_ERROR';
      }

      return 'UNKNOWN_ERROR';
  }
}

function parseRetryAfter(
  value: string | null,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (
    Number.isFinite(seconds) &&
    seconds >= 0
  ) {
    return seconds * 1000;
  }

  const retryDate = Date.parse(value);

  if (!Number.isNaN(retryDate)) {
    return Math.max(
      0,
      retryDate - Date.now(),
    );
  }

  return undefined;
}

async function parseErrorResponse(
  response: Response,
): Promise<{
  message: string;
  code?: string;
}> {
  try {
    const body = await response.json();

    return {
      message:
        body?.error?.message ??
        body?.message ??
        response.statusText ??
        'Request failed',

      code:
        body?.error?.code ??
        body?.code,
    };
  } catch {
    return {
      message:
        response.statusText ||
        'Request failed',
    };
  }
}

function isOffline(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  );
}

function waitForOnline(
  signal?: AbortSignal,
): Promise<void> {
  if (!isOffline()) {
    return Promise.resolve();
  }

  return new Promise(
    (resolve, reject) => {
      const handleOnline = () => {
        cleanup();
        resolve();
      };

      const handleAbort = () => {
        cleanup();
        reject(
          new DOMException(
            'Request cancelled.',
            'AbortError',
          ),
        );
      };

      const cleanup = () => {
        window.removeEventListener(
          'online',
          handleOnline,
        );

        signal?.removeEventListener(
          'abort',
          handleAbort,
        );
      };

      window.addEventListener(
        'online',
        handleOnline,
        { once: true },
      );

      signal?.addEventListener(
        'abort',
        handleAbort,
        { once: true },
      );

      if (signal?.aborted) {
        handleAbort();
      }
    },
  );
}

function sleep(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      const timeout = window.setTimeout(
        () => {
          cleanup();
          resolve();
        },
        delayMs,
      );

      const handleAbort = () => {
        window.clearTimeout(timeout);
        cleanup();

        reject(
          new DOMException(
            'Request cancelled.',
            'AbortError',
          ),
        );
      };

      const cleanup = () => {
        signal?.removeEventListener(
          'abort',
          handleAbort,
        );
      };

      signal?.addEventListener(
        'abort',
        handleAbort,
        { once: true },
      );

      if (signal?.aborted) {
        handleAbort();
      }
    },
  );
}

function calculateRetryDelay(
  attempt: number,
  retryAfter?: number,
): number {
  const exponentialDelay = Math.min(
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS *
      2 ** (attempt - 1),
  );

  const jitter =
    Math.random() * MAX_JITTER_MS;

  return Math.max(
    retryAfter ?? 0,
    exponentialDelay + jitter,
  );
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const signal = init.signal ?? undefined;
  for (
    let attempt = 1;
    attempt <= MAX_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    if (signalAborted(signal)) {
      throw new DOMException(
        'Request cancelled.',
        'AbortError',
      );
    }

    /*
     * Do not hammer the server while the browser
     * knows that the connection is offline.
     *
     * We wait for the connection to return request
     * than burning through retry attempts.
     */
    if (isOffline()) {
      await waitForOnline(
        signal,
      );
    }

    try {
      const response = await fetch(
        path,
        {
          ...init,
          headers: {
            'content-type':
              'application/json',
            ...init.headers,
          },
        },
      );

      if (response.ok) {
        return response.json() as Promise<T>;
      }

      const {
        message,
      } = await parseErrorResponse(
        response,
      );

      const error =
        new ApiError(
          message,
          response.status,
          getErrorCode(
            response.status,
          ),
          parseRetryAfter(
            response.headers.get(
              'Retry-After',
            ),
          ),
          response.headers.get(
            'x-request-id',
          ) ??
            response.headers.get(
              'request-id',
            ) ??
            undefined,
        );

      /*
       * 400 / 409 / 422 and other non-transient
       * errors fail immediately.
       */
      if (
        !error.retryable ||
        attempt === MAX_RETRY_ATTEMPTS
      ) {
        throw error;
      }

      const delay =
        calculateRetryDelay(
          attempt,
          error.retryAfter,
        );

      await sleep(
        delay,
        signal,
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        throw error;
      }

      if (error instanceof ApiError) {
        if (
          !error.retryable ||
          attempt === MAX_RETRY_ATTEMPTS
        ) {
          throw error;
        }

        const delay =
          calculateRetryDelay(
            attempt,
            error.retryAfter,
          );

        await sleep(
          delay,
          signal,
        );

        continue;
      }

      /*
       * fetch() normally throws TypeError for
       * network failures.
       */
      const networkError =
        new ApiError(
          'Unable to connect to the server.',
          0,
          'NETWORK_ERROR',
        );

      if (
        attempt === MAX_RETRY_ATTEMPTS
      ) {
        throw networkError;
      }

      if (isOffline()) {
        await waitForOnline(
          signal,
        );
      } else {
        const delay =
          calculateRetryDelay(
            attempt,
          );

        await sleep(
          delay,
          signal,
        );
      }
    }
  }

  throw new ApiError(
    'The request could not be completed.',
    0,
    'UNKNOWN_ERROR',
  );
}

function signalAborted(
  signal?: AbortSignal,
): boolean {
  return Boolean(signal?.aborted);
}

export function listAssets(
  query: AssetQuery,
  signal?: AbortSignal,
): Promise<AssetPage> {
  const params =
    toSearchParams(query);

  return request<AssetPage>(
    `/api/assets${
      params
        ? `?${params}`
        : ''
    }`,
    {
      signal,
    },
  );
}

export function getAsset(
  id: string,
  signal?: AbortSignal,
): Promise<Asset> {
  return request<Asset>(
    `/api/assets/${id}`,
    {
      signal,
    },
  );
}

export function getAssetsByIds(
  ids: string[],
  signal?: AbortSignal,
): Promise<{
  items: Asset[];
  missing: string[];
}> {
  return request(
    `/api/assets/batch?ids=${ids.join(',')}`,
    {
      signal,
    },
  );
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<
    Pick<
      Asset,
      'name' | 'status' | 'tags'
    >
  >,
): Promise<Asset> {
  return request<Asset>(
    `/api/assets/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        version,
        patch,
      }),
    },
  );
}

export function bulkSetStatus(
  ids: string[],
  status: Asset['status'],
  signal?: AbortSignal,
): Promise<BulkResult> {
  return request<BulkResult>(
    '/api/assets/bulk-status',
    {
      method: 'POST',
      body: JSON.stringify({
        ids,
        status,
      }),
      signal,
    },
  );
}

export const thumbnailUrl = (
  id: string,
) => `/api/thumb/${id}.svg`;