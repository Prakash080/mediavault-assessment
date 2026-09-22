import { memo, useState } from 'react';

import { thumbnailUrl } from '@/api/client';

import {
  formatBytes,
  formatDate,
  statusLabel,
} from '@/lib/format';

import type { Asset } from '@/lib/types';

interface Props {
  asset: Asset;
  selected: boolean;
  active: boolean;

  onToggleSelect: (id: string) => void;
  onRangeSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

function AssetThumbnail({
  asset,
}: {
  asset: Asset;
}) {
  const [failed, setFailed] = useState(false);

  if (!asset.hasThumbnail || failed) {
    return (
      <div
        className="card__thumb card__thumb--placeholder"
        aria-hidden="true"
      >
        <span>No preview</span>
      </div>
    );
  }

  return (
    <img
      className="card__thumb"
      src={thumbnailUrl(asset.id)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export const AssetCard = memo(
  function AssetCard({
    asset,
    selected,
    active,
    onToggleSelect,
    onRangeSelect,
    onOpen,
  }: Props) {
    return (
      <article
        className={
          'card' +
          (selected
            ? ' card--selected'
            : '') +
          (active
            ? ' card--active'
            : '')
        }
        onClick={() => onOpen(asset.id)}
        tabIndex={0}
        role="button"
        aria-pressed={selected}
        aria-label={`Open ${asset.name}`}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' ||
            event.key === ' '
          ) {
            event.preventDefault();
            onOpen(asset.id);
          }
        }}
      >
        <AssetThumbnail asset={asset} />

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

            if (
              event.nativeEvent instanceof
                MouseEvent &&
              event.nativeEvent.shiftKey
            ) {
              onRangeSelect(asset.id);
              return;
            }

            onToggleSelect(asset.id);
          }}
          aria-label={`Select ${asset.name}`}
        />
      </article>
    );
  },
);