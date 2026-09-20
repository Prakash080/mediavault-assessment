import { bulkSetStatus } from '@/api/client';
import { ApiError } from '@/api/errors';

import type { Asset, BulkResult } from '@/lib/types';

const BULK_CHUNK_SIZE = 50;
const BULK_CONCURRENCY = 3;

const MAX_REQUEST_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 500;
const MAX_RETRY_DELAY = 5000;

export interface BulkFailure {
  id: string;
  code: string;
  message: string;
}

export interface BulkOperationResult {
  applied: number;
  failures: BulkFailure[];
  assets: Asset[];
}

export interface BulkProgress {
  completed: number;
  total: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/**
 * Per-item failures returned by the bulk endpoint.
 *
 * These are different from HTTP-level failures.
 * For example, the whole request may return 200 while
 * individual assets can still fail with CONFLICT.
 */
function isRetryableFailure(code: string): boolean {
  const normalized = code.toLowerCase();

  return (
    normalized === 'conflict' ||
    normalized === 'rate_limited' ||
    normalized === 'rate-limited' ||
    normalized === 'timeout' ||
    normalized === 'temporary_failure' ||
    normalized === 'server_error'
  );
}

export function isBulkFailureRetryable(code: string): boolean {
  return isRetryableFailure(code);
}

function normalizeResult(result: BulkResult): BulkOperationResult {
  const assets: Asset[] = [];
  const failures: BulkFailure[] = [];

  for (const item of result.results) {
    if (item.ok) {
      assets.push(item.asset);
    } else {
      failures.push({
        id: item.id,
        code: item.code,
        message:
          item.message ??
          'The asset could not be updated.',
      });
    }
  }

  return {
    applied: assets.length,
    failures,
    assets,
  };
}

function sleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException(
      'Bulk operation cancelled.',
      'AbortError',
    );
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);

    const handleAbort = () => {
      window.clearTimeout(timeout);

      reject(
        new DOMException(
          'Bulk operation cancelled.',
          'AbortError',
        ),
      );
    };

    signal?.addEventListener(
      'abort',
      handleAbort,
      { once: true },
    );
  });
}

function getRetryDelay(
  attempt: number,
  retryAfter?: number,
): number {
  if (
    typeof retryAfter === 'number' &&
    Number.isFinite(retryAfter)
  ) {
    return Math.min(
      retryAfter,
      MAX_RETRY_DELAY,
    );
  }

  const exponentialDelay =
    DEFAULT_RETRY_DELAY *
    Math.pow(2, attempt);

  const jitter =
    Math.random() * 250;

  return Math.min(
    exponentialDelay + jitter,
    MAX_RETRY_DELAY,
  );
}

async function requestChunk(
  ids: string[],
  status: Asset['status'],
  signal?: AbortSignal,
): Promise<BulkOperationResult> {
  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw new DOMException(
        'Bulk operation cancelled.',
        'AbortError',
      );
    }

    try {
      const result = await bulkSetStatus(
        ids,
        status,
        signal,
      );

      return normalizeResult(result);
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        throw error;
      }

      const retryable =
        error instanceof ApiError
          ? error.retryable
          : false;

      if (
        !retryable ||
        attempt >= MAX_REQUEST_RETRIES
      ) {
        throw error;
      }

      const delay = getRetryDelay(
        attempt,
        error instanceof ApiError
          ? error.retryAfter
          : undefined,
      );

      await sleep(delay, signal);

      attempt += 1;
    }
  }
}

export async function runBulkStatusUpdate(
  ids: string[],
  status: Asset['status'],
  options?: {
    signal?: AbortSignal;
    onProgress?: (
      progress: BulkProgress,
    ) => void;
  },
): Promise<BulkOperationResult> {
  if (ids.length === 0) {
    return {
      applied: 0,
      failures: [],
      assets: [],
    };
  }

  const chunks = chunk(
    ids,
    BULK_CHUNK_SIZE,
  );

  const aggregate: BulkOperationResult = {
    applied: 0,
    failures: [],
    assets: [],
  };

  let nextChunkIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (options?.signal?.aborted) {
        throw new DOMException(
          'Bulk operation cancelled.',
          'AbortError',
        );
      }

      const currentIndex =
        nextChunkIndex;

      if (
        currentIndex >= chunks.length
      ) {
        return;
      }

      nextChunkIndex += 1;

      const currentChunk =
        chunks[currentIndex];

      if (!currentChunk) {
        continue;
      }

      try {
        const result =
          await requestChunk(
            currentChunk,
            status,
            options?.signal,
          );

        aggregate.applied +=
          result.applied;

        aggregate.assets.push(
          ...result.assets,
        );

        aggregate.failures.push(
          ...result.failures,
        );
      } catch (error) {
        /**
         * If the entire chunk fails at HTTP level,
         * preserve each ID as a failure instead of
         * losing the information about which assets
         * were affected.
         */
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          throw error;
        }

        const failureCode =
          error instanceof ApiError
            ? error.code
            : 'UNKNOWN_ERROR';

        const failureMessage =
          error instanceof Error
            ? error.message
            : 'Bulk update failed.';

        aggregate.failures.push(
          ...currentChunk.map((id) => ({
            id,
            code: failureCode,
            message: failureMessage,
          })),
        );
      } finally {
        completed +=
          currentChunk.length;

        options?.onProgress?.({
          completed: Math.min(
            completed,
            ids.length,
          ),
          total: ids.length,
        });
      }
    }
  }

  const workerCount = Math.min(
    BULK_CONCURRENCY,
    chunks.length,
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => worker(),
    ),
  );

  return aggregate;
}

export function getRetryableFailures(
  failures: BulkFailure[],
): BulkFailure[] {
  return failures.filter(
    (failure) =>
      isRetryableFailure(
        failure.code,
      ),
  );
}