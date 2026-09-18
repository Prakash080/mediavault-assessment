import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

interface AssetCardProps {
  asset: Asset;
  selected: boolean;
  active: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

const MIN_CARD_WIDTH = 220;
const GRID_GAP = 12;
const GRID_PADDING = 16;
const ESTIMATED_ROW_HEIGHT = 220;

const AssetCard = memo(function AssetCard({
  asset,
  selected,
  active,
  onToggleSelect,
  onOpen,
}: AssetCardProps) {
  return (
    <div
      className={
        'card' +
        (selected ? ' card--selected' : '') +
        (active ? ' card--active' : '')
      }
      role="button"
      tabIndex={0}
      onClick={() => onOpen(asset.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(asset.id);
        }
      }}
    >
      <img
        className="card__thumb"
        src={thumbnailUrl(asset.id)}
        alt=""
        loading="lazy"
      />

      <div className="card__body">
        <p className="card__name">{asset.name}</p>

        <p className="muted">
          {asset.kind} · {formatBytes(asset.sizeBytes)} ·{' '}
          {formatDate(asset.updatedAt)}
        </p>

        <span className={`pill pill--${asset.status}`}>
          {statusLabel(asset.status)}
        </span>
      </div>

      <input
        type="checkbox"
        className="card__check"
        checked={selected}
        onClick={(event) => event.stopPropagation()}
        onChange={() => onToggleSelect(asset.id)}
        aria-label={`Select ${asset.name}`}
      />
    </div>
  );
});

export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  onToggleSelect,
  onOpen,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
}: Props) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    const updateColumns = () => {
      const availableWidth =
        container.clientWidth - GRID_PADDING * 2;

      const columns = Math.max(
        1,
        Math.floor(
          (availableWidth + GRID_GAP) /
          (MIN_CARD_WIDTH + GRID_GAP),
        ),
      );

      setColumnCount((previous) =>
        previous === columns ? previous : columns,
      );
    };

    updateColumns();

    const resizeObserver = new ResizeObserver(updateColumns);

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const rows = useMemo(() => {
    const result: Asset[][] = [];

    for (
      let index = 0;
      index < assets.length;
      index += columnCount
    ) {
      result.push(assets.slice(index, index + columnCount));
    }

    return result;
  }, [assets, columnCount]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 3,
    measureElement: (element) => {
      return element.getBoundingClientRect().height;
    },
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  const lastVirtualRow =
    virtualRows[virtualRows.length - 1];

  useEffect(() => {
    if (
      !lastVirtualRow ||
      !hasNextPage ||
      isFetchingNextPage ||
      !onLoadMore
    ) {
      return;
    }

    const remainingRows =
      rows.length - 1 - lastVirtualRow.index;

    if (remainingRows <= 3) {
      onLoadMore();
    }
  }, [
    lastVirtualRow?.index,
    rows.length,
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
      <div
        className="grid"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];

          if (!row) {
            return null;
          }


          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="asset-grid-row"
              style={{
                position: 'absolute',
                top: 0,
                left: GRID_PADDING,
                right: GRID_PADDING,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                columnGap: `${GRID_GAP}px`,
                rowGap: `${GRID_GAP}px`,
                paddingBottom: `${GRID_GAP}px`,
                boxSizing: 'border-box',
              }}
            >
              {row.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  selected={selectedIds.has(asset.id)}
                  active={activeId === asset.id}
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpen}
                />
              ))}
            </div>
          );
        })}
      </div>

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
          All {assets.length.toLocaleString()} loaded assets are shown.
        </div>
      )}
    </div>
  );
}