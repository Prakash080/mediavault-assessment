import type { Asset, AssetPage, AssetQuery, BulkResult } from '@/lib/types';
import { ApiError, type ApiErrorCode } from './errors';

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();

  if (query.q) params.set('q', query.q);
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.kind?.length) params.set('kind', query.kind.join(','));
  if (query.tag?.length) params.set('tag', query.tag.join(','));
  if (query.collectionId) params.set('collectionId', query.collectionId);
  if (query.owner) params.set('owner', query.owner);
  if (query.sort) params.set('sort', query.sort);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);

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

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryDate = Date.parse(value);

  if (!Number.isNaN(retryDate)) {
    return Math.max(0, retryDate - Date.now());
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
      code: body?.error?.code ?? body?.code,
    };
  } catch {
    return {
      message: response.statusText || 'Request failed',
    };
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...init.headers,
      },
    });
  } catch (error) {
    // AbortError must remain an AbortError so React Query/browser
    // consumers can distinguish cancellation from a network failure.
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(
      'Unable to connect to the server. Please check your connection.',
      0,
      'NETWORK_ERROR',
    );
  }

  if (!response.ok) {
    const { message } = await parseErrorResponse(response);

    throw new ApiError(
      message,
      response.status,
      getErrorCode(response.status),
      parseRetryAfter(response.headers.get('Retry-After')),
      response.headers.get('x-request-id') ??
        response.headers.get('request-id') ??
        undefined,
    );
  }

  return response.json() as Promise<T>;
}

export function listAssets(
  query: AssetQuery,
  signal?: AbortSignal,
): Promise<AssetPage> {
  const params = toSearchParams(query);

  return request<AssetPage>(
    `/api/assets${params ? `?${params}` : ''}`,
    { signal },
  );
}

export function getAsset(
  id: string,
  signal?: AbortSignal,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, { signal });
}

export function getAssetsByIds(
  ids: string[],
  signal?: AbortSignal,
): Promise<{ items: Asset[]; missing: string[] }> {
  return request(`/api/assets/batch?ids=${ids.join(',')}`, {
    signal,
  });
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, 'name' | 'status' | 'tags'>>,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version, patch }),
  });
}

export function bulkSetStatus(
  ids: string[],
  status: Asset['status'],
  signal?: AbortSignal,
): Promise<BulkResult> {
  return request<BulkResult>('/api/assets/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ ids, status }),
    signal,
  });
}

export const thumbnailUrl = (id: string) => `/api/thumb/${id}.svg`;