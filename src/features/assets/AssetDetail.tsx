import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  getAsset,
  thumbnailUrl,
  updateAsset,
} from '@/api/client';

import { ApiError } from '@/api/errors';

import {
  formatBytes,
  formatDate,
  formatDuration,
  statusLabel,
} from '@/lib/format';

import type {
  Asset,
  AssetStatus,
} from '@/lib/types';

const STATUSES: AssetStatus[] = [
  'draft',
  'in_review',
  'approved',
  'archived',
];

interface Props {
  id: string;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}

export function AssetDetail({
  id,
  onClose,
  onSaved,
}: Props) {
  const [asset, setAsset] =
    useState<Asset | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [saving, setSaving] =
    useState(false);

  const [conflict, setConflict] =
    useState(false);

  const closeButtonRef =
    useRef<HTMLButtonElement | null>(
      null,
    );

  useEffect(() => {
    setAsset(null);
    setError(null);
    setConflict(false);

    getAsset(id)
      .then(setAsset)
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load this asset.',
        );
      });
  }, [id]);

  /*
   * Move focus into the detail panel as soon
   * as it opens.
   */
  useEffect(() => {
    requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
  }, [id]);

  /*
   * Escape closes the panel.
   */
  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [onClose]);

  async function setStatus(
    status: AssetStatus,
  ) {
    if (!asset) {
      return;
    }

    setSaving(true);
    setError(null);
    setConflict(false);

    try {
      const updated =
        await updateAsset(
          asset.id,
          asset.version,
          { status },
        );

      setAsset(updated);
      onSaved(updated);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409
      ) {
        try {
          const latest =
            await getAsset(
              asset.id,
            );

          setAsset(latest);
          setConflict(true);

          setError(
            'This asset was changed by someone else. ' +
            'The latest version has been loaded. ' +
            'Review it before saving again.',
          );
        } catch {
          setError(
            'This asset was changed by someone else, ' +
            'but the latest version could not be loaded.',
          );
        }

        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save the asset.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside
      className="panel"
      aria-label={`Asset detail${
        asset ? `: ${asset.name}` : ''
      }`}
    >
      <div className="panel__head">
        <h2
          id="asset-detail-title"
          tabIndex={-1}
        >
          Asset detail
        </h2>

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close asset detail"
        >
          Close
        </button>
      </div>

      {error && (
        <p
          className={
            conflict
              ? 'error panel__conflict'
              : 'error'
          }
          role="alert"
        >
          {error}
        </p>
      )}

      {!asset && !error && (
        <p
          className="muted"
          role="status"
        >
          Loading asset details…
        </p>
      )}

      {asset && (
        <div className="panel__body">
          <img
            className="panel__thumb"
            src={thumbnailUrl(asset.id)}
            alt=""
            onError={(event) => {
              event.currentTarget.style.visibility =
                'hidden';

              event.currentTarget.parentElement
                ?.classList.add(
                  'panel__thumb--missing',
                );
            }}
          />

          <h3>{asset.name}</h3>

          <dl className="facts">
            <dt>Id</dt>
            <dd>{asset.id}</dd>

            <dt>Kind</dt>
            <dd>{asset.kind}</dd>

            <dt>Size</dt>
            <dd>
              {formatBytes(
                asset.sizeBytes,
              )}
            </dd>

            {asset.width !== null &&
              asset.height !== null && (
                <>
                  <dt>Dimensions</dt>
                  <dd>
                    {asset.width}×
                    {asset.height}
                  </dd>
                </>
              )}

            {asset.durationSec !==
              null && (
              <>
                <dt>Duration</dt>
                <dd>
                  {formatDuration(
                    asset.durationSec,
                  )}
                </dd>
              </>
            )}

            <dt>Owner</dt>
            <dd>
              {asset.owner.name}
            </dd>

            <dt>Updated</dt>
            <dd>
              {formatDate(
                asset.updatedAt,
              )}
            </dd>

            <dt>Version</dt>
            <dd>{asset.version}</dd>
          </dl>

          {asset.tags.length > 0 && (
            <ul
              className="tags"
              aria-label="Asset tags"
            >
              {asset.tags.map(
                (tag) => (
                  <li key={tag}>
                    {tag}
                  </li>
                ),
              )}
            </ul>
          )}

          <p className="muted">
            Status
          </p>

          <div
            className="row"
            role="group"
            aria-label="Change asset status"
          >
            {STATUSES.map(
              (status) => (
                <button
                  key={status}
                  type="button"
                  disabled={
                    saving ||
                    status ===
                      asset.status
                  }
                  aria-pressed={
                    status ===
                    asset.status
                  }
                  onClick={() =>
                    setStatus(status)
                  }
                >
                  {statusLabel(
                    status,
                  )}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </aside>
  );
}