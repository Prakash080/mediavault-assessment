import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

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
  const loadMoreRef =
    useRef<HTMLDivElement | null>(null);

  const scrollContainerRef =
    useRef<HTMLDivElement | null>(null);

  const cardRefs =
    useRef<Map<string, HTMLDivElement>>(
      new Map(),
    );

  const rangeAnchorRef =
    useRef<string | null>(null);

  const lastOpenedIdRef =
    useRef<string | null>(null);

  const previousActiveIdRef =
    useRef<string | null>(null);

  const [focusedId, setFocusedId] =
    useState<string | null>(
      assets[0]?.id ?? null,
    );

  /*
   * Keep the focused card valid when:
   * - filters change
   * - search results change
   * - pagination changes
   * - the currently focused asset disappears
   */
  useLayoutEffect(() => {
    if (assets.length === 0) {
      setFocusedId(null);
      return;
    }

    const currentStillExists =
      focusedId !== null &&
      assets.some(
        (asset) => asset.id === focusedId,
      );

    if (currentStillExists) {
      return;
    }

    const nextId =
      assets[0]?.id ?? null;

    setFocusedId(nextId);

    if (
      nextId &&
      activeId === null
    ) {
      requestAnimationFrame(() => {
        cardRefs.current
          .get(nextId)
          ?.focus();
      });
    }
  }, [
    assets,
    focusedId,
    activeId,
  ]);

  /*
   * When the detail panel closes, restore focus
   * to the card that opened it.
   */
  useEffect(() => {
    const previousActiveId =
      previousActiveIdRef.current;

    if (
      previousActiveId !== null &&
      activeId === null
    ) {
      const restoreId =
        lastOpenedIdRef.current;

      if (restoreId) {
        setFocusedId(restoreId);

        requestAnimationFrame(() => {
          cardRefs.current
            .get(restoreId)
            ?.focus();
        });
      }
    }

    previousActiveIdRef.current =
      activeId;
  }, [activeId]);

  /*
   * Infinite-scroll sentinel.
   */
  useEffect(() => {
    const sentinel =
      loadMoreRef.current;

    const scrollContainer =
      scrollContainerRef.current;

    if (
      !sentinel ||
      !scrollContainer ||
      !hasNextPage ||
      !onLoadMore
    ) {
      return;
    }

    const observer =
      new IntersectionObserver(
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

    return () => {
      observer.disconnect();
    };
  }, [
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
  ]);

  function registerCard(
    id: string,
    node: HTMLDivElement | null,
  ) {
    if (node) {
      cardRefs.current.set(id, node);
    } else {
      cardRefs.current.delete(id);
    }
  }

  function focusCard(
    id: string,
  ) {
    const card =
      cardRefs.current.get(id);

    if (!card) {
      return;
    }

    setFocusedId(id);

    card.focus({
      preventScroll: true,
    });

    card.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }

  function getNextCardId(
    currentId: string,
    direction:
      | 'left'
      | 'right'
      | 'up'
      | 'down',
  ): string | null {
    const currentIndex =
      assets.findIndex(
        (asset) => asset.id === currentId,
      );

    if (currentIndex === -1) {
      return null;
    }

    if (
      direction === 'left'
    ) {
      return (
        assets[currentIndex - 1]
          ?.id ?? null
      );
    }

    if (
      direction === 'right'
    ) {
      return (
        assets[currentIndex + 1]
          ?.id ?? null
      );
    }

    const currentCard =
      cardRefs.current.get(currentId);

    if (!currentCard) {
      return null;
    }

    const currentRect =
      currentCard.getBoundingClientRect();

    const currentCenterX =
      currentRect.left +
      currentRect.width / 2;

    const currentCenterY =
      currentRect.top +
      currentRect.height / 2;

    let bestId: string | null =
      null;

    let bestScore = Number.POSITIVE_INFINITY;

    for (const asset of assets) {
      if (asset.id === currentId) {
        continue;
      }

      const candidate =
        cardRefs.current.get(asset.id);

      if (!candidate) {
        continue;
      }

      const rect =
        candidate.getBoundingClientRect();

      const centerX =
        rect.left +
        rect.width / 2;

      const centerY =
        rect.top +
        rect.height / 2;

      if (
        direction === 'up' &&
        centerY >= currentCenterY
      ) {
        continue;
      }

      if (
        direction === 'down' &&
        centerY <= currentCenterY
      ) {
        continue;
      }

      const verticalDistance =
        Math.abs(
          centerY - currentCenterY,
        );

      const horizontalDistance =
        Math.abs(
          centerX - currentCenterX,
        );

      /*
       * Prefer cards in the same visual column,
       * then use distance as the tie breaker.
       */
      const score =
        verticalDistance * 10 +
        horizontalDistance;

      if (score < bestScore) {
        bestScore = score;
        bestId = asset.id;
      }
    }

    return bestId;
  }

  function moveFocus(
    direction:
      | 'left'
      | 'right'
      | 'up'
      | 'down',
    extendSelection: boolean,
  ) {
    const currentId =
      focusedId ??
      assets[0]?.id;

    if (!currentId) {
      return;
    }

    const nextId =
      getNextCardId(
        currentId,
        direction,
      );

    if (!nextId) {
      return;
    }

    if (extendSelection) {
      const anchor =
        rangeAnchorRef.current ??
        currentId;

      onRangeSelect(
        anchor,
        nextId,
      );
    } else {
      rangeAnchorRef.current =
        nextId;
    }

    focusCard(nextId);
  }

  function handleCardKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
    asset: Asset,
  ) {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();

        moveFocus(
          'left',
          event.shiftKey,
        );
        return;

      case 'ArrowRight':
        event.preventDefault();

        moveFocus(
          'right',
          event.shiftKey,
        );
        return;

      case 'ArrowUp':
        event.preventDefault();

        moveFocus(
          'up',
          event.shiftKey,
        );
        return;

      case 'ArrowDown':
        event.preventDefault();

        moveFocus(
          'down',
          event.shiftKey,
        );
        return;

      case 'Enter':
        event.preventDefault();

        lastOpenedIdRef.current =
          asset.id;

        rangeAnchorRef.current =
          asset.id;

        onOpen(asset.id);
        return;

      case ' ':
      case 'Spacebar':
        event.preventDefault();

        rangeAnchorRef.current =
          asset.id;

        onToggleSelect(asset.id);
        return;

      default:
        return;
    }
  }

  function handleCardClick(
    asset: Asset,
  ) {
    focusCard(asset.id);

    lastOpenedIdRef.current =
      asset.id;

    rangeAnchorRef.current =
      asset.id;

    onOpen(asset.id);
  }

  function handleCheckboxChange(
    asset: Asset,
    shiftKey: boolean,
  ) {
    focusCard(asset.id);

    if (shiftKey) {
      const anchor =
        rangeAnchorRef.current ??
        asset.id;

      onRangeSelect(
        anchor,
        asset.id,
      );

      return;
    }

    rangeAnchorRef.current =
      asset.id;

    onToggleSelect(asset.id);
  }

  if (assets.length === 0) {
    return (
      <div className="empty">
        <p>Nothing matches these filters.</p>

        <p className="muted">
          Clear the search box or widen the
          status filter.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="asset-grid-container"
      role="region"
      aria-label="Asset library"
    >
      <div
        className="grid"
        role="grid"
        aria-label="Media assets"
        aria-rowcount={-1}
        aria-colcount={-1}
      >
        {assets.map((asset) => {
          const selected =
            selectedIds.has(asset.id);

          const active =
            activeId === asset.id;

          const isFocused =
            focusedId === asset.id;

          return (
            <div
              key={asset.id}
              ref={(node) =>
                registerCard(
                  asset.id,
                  node,
                )
              }
              className={
                'card' +
                (selected
                  ? ' card--selected'
                  : '') +
                (active
                  ? ' card--active'
                  : '')
              }
              role="gridcell"
              aria-selected={selected}
              aria-label={`${asset.name}, ${statusLabel(asset.status)}`}
              tabIndex={
                isFocused ? 0 : -1
              }
              onFocus={() => {
                setFocusedId(
                  asset.id,
                );
              }}
              onKeyDown={(event) =>
                handleCardKeyDown(
                  event,
                  asset,
                )
              }
              onClick={() =>
                handleCardClick(asset)
              }
            >
              <img
                className="card__thumb"
                src={thumbnailUrl(
                  asset.id,
                )}
                alt=""
                loading="lazy"
                onError={(event) => {
                  const image =
                    event.currentTarget;

                  image.style.visibility =
                    'hidden';

                  image.parentElement?.classList.add(
                    'card__thumb--missing',
                  );
                }}
              />

              <div className="card__body">
                <p className="card__name">
                  {asset.name}
                </p>

                <p className="muted">
                  {asset.kind} ·{' '}
                  {formatBytes(
                    asset.sizeBytes,
                  )}{' '}
                  ·{' '}
                  {formatDate(
                    asset.updatedAt,
                  )}
                </p>

                <span
                  className={`pill pill--${asset.status}`}
                >
                  {statusLabel(
                    asset.status,
                  )}
                </span>
              </div>

              <input
                type="checkbox"
                className="card__check"
                checked={selected}
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onChange={(event) => {
                  event.stopPropagation();

                  handleCheckboxChange(
                    asset,
                    event.nativeEvent instanceof
                      MouseEvent
                      ? event.nativeEvent.shiftKey
                      : false,
                  );
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

      {!hasNextPage &&
        assets.length > 0 && (
          <div className="load-more-status">
            All{' '}
            {assets.length.toLocaleString()}{' '}
            loaded assets are shown.
          </div>
        )}
    </div>
  );
}