import { useEffect, useRef } from 'react';

import { thumbnailUrl } from '@/api/client';
import {
  formatBytes,
  formatDate,
  statusLabel,
} from '@/lib/format';

import type { Asset } from '@/lib/types';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;

  onToggleSelect: (id: string) => void;
  onRangeSelect: (fromId: string, toId: string) => void;

  onOpen: (id: string) => void;

  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  onToggleSelect,
  onRangeSelect,
  onOpen,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
}: Props) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    const scrollContainer = scrollContainerRef.current;

    if (
      !sentinel ||
      !scrollContainer ||
      !hasNextPage ||
      !onLoadMore
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry?.isIntersecting &&
          !isFetchingNextPage
        ) {
          onLoadMore();
        }
      },
      {
        root: scrollContainer,
        rootMargin: '300px 0px',
        threshold: 0,
      },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
  ]);

  if (assets.length === 0) {
    return (
      <div className="empty">
        <p>Nothing matches these filters.</p>
        <p className="muted">
          Clear the search box or widen the status filter.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="asset-grid-container"
    >
      <div className="grid">
        {assets.map((asset) => {
          const selected = selectedIds.has(asset.id);
          const active = activeId === asset.id;

          return (
            <div
              key={asset.id}
              className={
                'card' +
                (selected ? ' card--selected' : '') +
                (active ? ' card--active' : '')
              }
              onClick={() => onOpen(asset.id)}
            >
              <img
                className="card__thumb"
                src={thumbnailUrl(asset.id)}
                alt=""
              />

              <div className="card__body">
                <p className="card__name">
                  {asset.name}
                </p>

                <p className="muted">
                  {asset.kind} ·{' '}
                  {formatBytes(asset.sizeBytes)} ·{' '}
                  {formatDate(asset.updatedAt)}
                </p>

                <span
                  className={`pill pill--${asset.status}`}
                >
                  {statusLabel(asset.status)}
                </span>
              </div>

              <input
                type="checkbox"
                className="card__check"
                checked={selected}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onChange={(event) => {
                  event.stopPropagation();

                  if (event.nativeEvent instanceof MouseEvent &&
                      event.nativeEvent.shiftKey) {
                    onRangeSelect(
                      [...selectedIds][
                        [...selectedIds].length - 1
                      ] ?? asset.id,
                      asset.id,
                    );
                    return;
                  }

                  onToggleSelect(asset.id);
                }}
                aria-label={`Select ${asset.name}`}
              />
            </div>
          );
        })}
      </div>

      <div
        ref={loadMoreRef}
        className="load-more-sentinel"
        aria-hidden="true"
      />

      {isFetchingNextPage && (
        <div
          className="load-more-status"
          aria-live="polite"
        >
          Loading more assets…
        </div>
      )}

      {!hasNextPage && assets.length > 0 && (
        <div className="load-more-status">
          All {assets.length.toLocaleString()} loaded
          assets are shown.
        </div>
      )}
    </div>
  );
}