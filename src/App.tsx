import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
  AssetDetail,
} from '@/features/assets/AssetDetail';

import {
  AssetGrid,
} from '@/features/assets/AssetGrid';

import {
  useAssets,
} from '@/features/assets/useAssets';

import {
  statusLabel,
} from '@/lib/format';

import {
  getRetryableFailures,
  runBulkStatusUpdate,
  type BulkFailure,
} from '@/lib/bulk';

import type {
  Asset,
  AssetStatus,
  AssetQuery,
} from '@/lib/types';

import { useDebounce } from '@/hooks/useDebounce';

const STATUSES: AssetStatus[] = [
  'draft',
  'in_review',
  'approved',
  'archived',
];

const SORTS: Array<{
  value: NonNullable<AssetQuery['sort']>;
  label: string;
}> = [
    {
      value: 'updatedAt:desc',
      label: 'Recently updated',
    },
    {
      value: 'name:asc',
      label: 'Name A–Z',
    },
    {
      value: 'sizeBytes:desc',
      label: 'Largest first',
    },
    {
      value: 'createdAt:desc',
      label: 'Newest',
    },
  ];

export function App() {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 300);

  const [status, setStatus] =
    useState<AssetStatus[]>([]);

  const [sort, setSort] =
    useState<
      NonNullable<AssetQuery['sort']>
    >('updatedAt:desc');

  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(new Set());

  const [lastSelectedId, setLastSelectedId] =
    useState<string | null>(null);

  const [activeId, setActiveId] =
    useState<string | null>(null);

  const [notice, setNotice] =
    useState<string | null>(null);

  const [bulkFailures, setBulkFailures] =
    useState<BulkFailure[]>([]);

  const [bulkProgress, setBulkProgress] =
    useState<{
      completed: number;
      total: number;
    } | null>(null);

  const [bulkStatus, setBulkStatus] =
    useState<AssetStatus | null>(null);

  const [lastBulkStatus, setLastBulkStatus] =
    useState<AssetStatus | null>(null);

  const [bulkError, setBulkError] =
    useState<string | null>(null);

  const [retryableFailures, setRetryableFailures] =
    useState<BulkFailure[]>([]);

  const {
    items,
    total,
    loading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    updateAssetsInCache,
  } = useAssets({
    q: debouncedQ,
    status,
    sort,
    limit: 24,
  });

  const assetMap = useMemo(
    () =>
      new Map(
        items.map((asset) => [
          asset.id,
          asset,
        ]),
      ),
    [items],
  );

  const allLoadedSelected =
    items.length > 0 &&
    items.every((asset) =>
      selectedIds.has(asset.id),
    );

  const toggleSelect = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        return next;
      });

      setLastSelectedId(id);
    },
    [],
  );

  const selectRange = useCallback(
    (fromId: string, toId: string) => {
      const fromIndex = items.findIndex(
        (asset) => asset.id === fromId,
      );

      const toIndex = items.findIndex(
        (asset) => asset.id === toId,
      );

      if (
        fromIndex === -1 ||
        toIndex === -1
      ) {
        toggleSelect(toId);
        return;
      }

      const start = Math.min(
        fromIndex,
        toIndex,
      );

      const end = Math.max(
        fromIndex,
        toIndex,
      );

      setSelectedIds((prev) => {
        const next = new Set(prev);

        for (
          let index = start;
          index <= end;
          index += 1
        ) {
          const asset = items[index];
          if (asset) {
            next.add(asset.id);
          }
        }

        return next;
      });

      setLastSelectedId(toId);
    },
    [items, toggleSelect],
  );

  const selectAllLoaded = useCallback(() => {
    setSelectedIds(
      new Set(items.map((asset) => asset.id)),
    );

    setLastSelectedId(
      items[items.length - 1]?.id ?? null,
    );
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const performBulkStatus = useCallback(
    async (
      nextStatus: AssetStatus,
      idsToUpdate: string[],
    ) => {
      if (idsToUpdate.length === 0) {
        return;
      }
      setLastBulkStatus(nextStatus);
      setBulkStatus(nextStatus);
      setBulkError(null);
      setNotice(null);
      setBulkFailures([]);
      setRetryableFailures([]);

      const originalAssets = idsToUpdate
        .map((id) => assetMap.get(id))
        .filter(
          (asset): asset is Asset =>
            Boolean(asset),
        );

      const optimisticAssets =
        originalAssets.map((asset) => ({
          ...asset,
          status: nextStatus,
        }));

      // Optimistic update.
      updateAssetsInCache(
        optimisticAssets,
      );

      try {
        const result =
          await runBulkStatusUpdate(
            idsToUpdate,
            nextStatus,
            {
              onProgress: setBulkProgress,
            },
          );

        // Successful server responses are
        // authoritative.
        updateAssetsInCache(
          result.assets,
        );

        // Roll back failed assets individually.
        const failedIds = new Set(
          result.failures.map(
            (failure) => failure.id,
          ),
        );

        const rollbackAssets =
          originalAssets.filter(
            (asset) =>
              failedIds.has(asset.id),
          );

        updateAssetsInCache(
          rollbackAssets,
        );

        setBulkFailures(
          result.failures,
        );

        const retryable =
          getRetryableFailures(
            result.failures,
          );

        setRetryableFailures(
          retryable,
        );

        setNotice(
          `${result.applied} updated, ` +
          `${result.failures.length} failed.`,
        );

        if (
          result.failures.length === 0
        ) {
          clearSelection();
        } else {
          setSelectedIds(
            new Set(
              result.failures.map(
                (failure) =>
                  failure.id,
              ),
            ),
          );
        }
      } catch (err) {
        // If the complete operation itself fails,
        // restore every optimistically updated asset.
        updateAssetsInCache(
          originalAssets,
        );

        if (
          err instanceof DOMException &&
          err.name === 'AbortError'
        ) {
          setBulkError(
            'Bulk update was cancelled.',
          );
        } else {
          setBulkError(
            err instanceof Error
              ? err.message
              : 'Bulk update failed.',
          );
        }
      } finally {
        setBulkStatus(null);
        setBulkProgress(null);
      }
    },
    [
      assetMap,
      clearSelection,
      updateAssetsInCache,
    ],
  );

  async function applyBulkStatus(
    nextStatus: AssetStatus,
  ) {
    const ids = [...selectedIds];

    await performBulkStatus(
      nextStatus,
      ids,
    );
  }

  async function retryFailed() {
    if (!lastBulkStatus || retryableFailures.length === 0) {
      return;
    }

    const ids = retryableFailures.map(
      (failure) => failure.id,
    );

    await performBulkStatus(
      lastBulkStatus,
      ids,
    );
  }

  function handleSaved(asset: Asset) {
    updateAssetsInCache([asset]);
  }

  const handleLoadMore = useCallback(
    () => {
      if (
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage();
      }
    },
    [
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
    ],
  );

  return (
    <div className="app">
      <header className="topbar">
        <h1>MediaVault</h1>

        <input
          className="search"
          type="search"
          placeholder="Search assets"
          value={q}
          onChange={(event) =>
            setQ(event.target.value)
          }
        />

        <select
          value={sort}
          onChange={(event) =>
            setSort(
              event.target.value as typeof sort,
            )
          }
        >
          {SORTS.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </header>

      <div className="filters">
        {STATUSES.map((currentStatus) => (
          <label
            key={currentStatus}
          >
            <input
              type="checkbox"
              checked={status.includes(
                currentStatus,
              )}
              onChange={(event) =>
                setStatus((previous) =>
                  event.target.checked
                    ? [
                      ...previous,
                      currentStatus,
                    ]
                    : previous.filter(
                      (value) =>
                        value !==
                        currentStatus,
                    ),
                )
              }
            />

            {statusLabel(
              currentStatus,
            )}
          </label>
        ))}

        <span className="muted">
          {loading
            ? 'Loading…'
            : `${items.length} of ${total.toLocaleString()} shown`}
        </span>
      </div>

      {items.length > 0 && (
        <div className="selectionbar">
          <button
            type="button"
            onClick={
              allLoadedSelected
                ? clearSelection
                : selectAllLoaded
            }
          >
            {allLoadedSelected
              ? 'Clear all loaded'
              : `Select all ${items.length} loaded`}
          </button>

          {selectedIds.size > 0 && (
            <span className="muted">
              {selectedIds.size} selected
            </span>
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div
          className="bulkbar"
          aria-live="polite"
        >
          <span>
            {selectedIds.size} selected
          </span>

          {STATUSES.map(
            (currentStatus) => (
              <button
                key={currentStatus}
                disabled={
                  bulkStatus !== null
                }
                onClick={() =>
                  applyBulkStatus(
                    currentStatus,
                  )
                }
              >
                Set{' '}
                {statusLabel(
                  currentStatus,
                ).toLowerCase()}
              </button>
            ),
          )}

          <button
            disabled={
              bulkStatus !== null
            }
            onClick={clearSelection}
          >
            Clear selection
          </button>
        </div>
      )}

      {bulkProgress &&
        bulkStatus && (
          <div
            className="bulk-progress"
            role="status"
            aria-live="polite"
          >
            Updating{' '}
            {bulkProgress.total}{' '}
            assets to{' '}
            {statusLabel(
              bulkStatus,
            ).toLowerCase()}
            …{' '}
            {bulkProgress.completed}/
            {bulkProgress.total}
          </div>
        )}

      {notice && (
        <p className="notice">
          {notice}
        </p>
      )}

      {bulkError && (
        <p
          className="error"
          role="alert"
        >
          {bulkError}
        </p>
      )}

      {bulkFailures.length > 0 && (
        <div
          className="bulk-results"
          role="status"
        >
          <strong>
            Some assets could not be updated
          </strong>

          <ul>
            {bulkFailures.map(
              (failure) => {
                const asset =
                  assetMap.get(
                    failure.id,
                  );

                return (
                  <li key={failure.id}>
                    <strong>
                      {asset?.name ??
                        failure.id}
                    </strong>
                    {' — '}
                    {failure.message}
                  </li>
                );
              },
            )}
          </ul>

          {retryableFailures.length >
            0 && (
              <button
                type="button"
                disabled={bulkStatus !== null}
                onClick={() => {
                  void retryFailed();
                }}
              >
                Retry {retryableFailures.length} retryable failures
              </button>
            )}
        </div>
      )}

      {error && (
        <p
          className="error"
          role="alert"
        >
          {error}
        </p>
      )}

      <main className="content">
        <AssetGrid
          assets={items}
          selectedIds={selectedIds}
          activeId={activeId}
          onToggleSelect={toggleSelect}
          onRangeSelect={(
            fromId,
            toId,
          ) => {
            selectRange(
              lastSelectedId ??
              fromId,
              toId,
            );
          }}
          onOpen={setActiveId}
          hasNextPage={hasNextPage}
          isFetchingNextPage={
            isFetchingNextPage
          }
          onLoadMore={
            handleLoadMore
          }
        />

        {activeId && (
          <AssetDetail
            id={activeId}
            onClose={() =>
              setActiveId(null)
            }
            onSaved={handleSaved}
          />
        )}
      </main>
    </div>
  );
}