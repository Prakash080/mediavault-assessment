# Submission

## Video walkthrough

**Link:** [Loom Video Link->](https://www.loom.com/share/6459da36ddf1469b9a09c8bee6bcb54d)

## How to run it

```bash
npm install
npm run dev
```

Requirements:
- Node.js 20.11+
- The app runs on Vite at `http://localhost:5173`.
- The mock API runs on `http://localhost:8787`.
- Keep the API defaults enabled for the review; the assessment is designed to exercise latency, failures, rate limits, conflicts and partial bulk failures.

No server/API changes were made.

## Time spent

Approximately **10–14 focused hours**, including:
- Baseline review and defect inventory
- Search/pagination/request handling
- Bulk actions and failure handling
- Resilience/offline behaviour
- Keyboard/accessibility work
- Grid/card UI and visual cleanup
- Final verification and walkthrough preparation

## Baseline defects found

| # | Defect | Where | Status |
| --- | --- | --- | --- |
| 1 | Bulk update sends more than the API's 50-id limit in one request | `App.tsx` / bulk flow | **Fixed** — ids are chunked into batches of 50 with bounded concurrency |
| 2 | Search/filter requests can race and stale responses can win | asset fetching/client | **Fixed** — query keys separate result sets and React Query cancellation signals are passed to fetches |
| 3 | Typing can generate too many API requests | search input | **Fixed** — 300ms debounce |
| 4 | Cursor can become stale after the query changes | pagination/query lifecycle | **Fixed** — pagination belongs to the query-keyed infinite query, so a changed query starts from a fresh cursor |
| 5 | Bulk partial success is treated like an all-or-nothing operation | bulk update flow | **Fixed** — successful assets are applied, failed assets are rolled back individually and reported |
| 6 | Retryable bulk failures cannot be retried with the original target status | bulk update flow | **Fixed** — the last requested status is preserved and retryable failures can be retried |
| 7 | Transient HTTP failures are not handled deliberately | `src/api/client.ts` | **Fixed** — bounded retries, exponential backoff, jitter and `Retry-After` support |
| 8 | Offline requests can waste retries while the browser has no connection | `src/api/client.ts` / `useOnlineStatus` | **Fixed** — requests wait for connectivity and the UI exposes offline state |
| 9 | Version conflicts need a fresh server version before another save | `AssetDetail.tsx` | **Fixed** — a `409` reloads the latest asset and asks the user to review it |
| 10 | Missing thumbnails can create broken image states | `AssetCard.tsx` | **Fixed** — `hasThumbnail`, lazy loading and a stable placeholder are used |
| 11 | Cards were not independently memoized | asset card rendering | **Fixed** — `AssetCard` is memoized and receives focused props |
| 12 | Grid/detail interactions did not provide a complete keyboard path | asset grid/card/detail flow | **Fixed** — keyboard opening, arrow navigation, selection and focus restoration were added |
| 13 | Unexpected React errors had no application-level fallback | application root | **Fixed** — `ErrorBoundary` provides a recoverable reload state |
| 14 | Loading, empty, error, offline and partial-failure states were not clearly represented | app UI | **Fixed** — explicit UI messaging was added for the supported states |

## Key decisions

### Data fetching and caching

I kept TanStack Query for server state because the asset list is naturally query-keyed and cursor-paginated. The complete filter/search state forms the query identity, while `useInfiniteQuery` owns page parameters and cancellation. This also avoids manually maintaining multiple competing request states.

### Stale response handling

Search uses a **300ms debounce** to avoid firing a request for every keystroke. Query changes produce a different React Query key, and the query function receives the framework-provided `AbortSignal`, which is forwarded to `fetch`. The important part is that an obsolete request is cancelled rather than merely ignored by a UI flag.

### Infinite scrolling

The grid uses cursor pagination and an `IntersectionObserver` sentinel to request the next page before the user reaches the end. I deliberately kept the implementation simple rather than introducing another virtualization abstraction late in the task.

**Important limitation:** the current implementation is **not a true windowed/virtualized list**. Loaded pages remain mounted. With another iteration I would use `@tanstack/react-virtual` (already available in the project) to bound DOM size at the full 12,400-asset scale.

### Optimistic updates and rollback

Bulk status changes update the currently loaded assets optimistically. Once the server responds, successful assets are replaced with authoritative server responses. Per-item failures are rolled back to their original asset objects, so a partial failure never leaves the UI claiming that a failed update succeeded.

### Retry and backoff policy

Retries are bounded rather than infinite. Transient HTTP failures use exponential backoff with jitter and respect `Retry-After` when provided. Abort errors and non-transient errors are not retried. Bulk requests are also chunked to the backend's 50-id limit and processed with a concurrency limit of three.

### State placement and URL sync

Local interaction state remains in React state because selection, active detail and transient bulk progress are UI state.

**Known cut:** the current final build does **not** implement the requested URL synchronization for `q`, status, kind, tag and sort. I would add this next using `history.replaceState`/`pushState` or a small URL-state hook, while keeping selection and transient operation state out of the URL.

## Performance

I did not want to invent measurements that were not captured during the final run.

| Metric | Before | After | How measured |
| --- | --- | --- | --- |
| Rendered DOM nodes at 5,000 rows loaded | Not captured | Not captured | Requires a final browser/DevTools measurement |
| Cards re-rendered when toggling one selection | Not captured | Intended to be isolated by `React.memo` | React DevTools Profiler |
| Longest task during sustained scroll | Not captured | Not captured | Chrome Performance panel |
| Requests fired while typing a 6-character query | Not captured | Debounced to a 300ms search pipeline | Browser Network panel |
| Production bundle, gzipped | Assessment baseline: ~48 kB | ~68.5 kB for JS + CSS, excluding source maps | `npm run build` + gzip |

The biggest practical bottlenecks addressed in the implementation were request churn/races, unbounded bulk requests, repeated card work, and unreliable network behaviour.

**Scale limitation:** because the current grid is not virtualized, the DOM will still grow as more cursor pages are loaded. I would not claim that the 5,000/12,400-row DOM-size requirement is fully satisfied.

## Accessibility

The asset cards expose a keyboard-operable button-like interaction, support Enter/Space to open an asset, and support directional navigation through the grid. Selection remains available through the native checkbox, including Shift-based range selection. Focus is restored to the card that opened the detail panel after the panel closes, and result/status changes use live regions where appropriate.

Testing performed:
- Keyboard-only navigation through the grid
- Enter/Space activation
- Arrow-key movement
- Selection and Shift-range selection
- Opening/closing the detail panel and focus restoration
- Offline/error/status announcements

Known gaps:
- A full screen-reader audit was not completed with a dedicated screen reader.
- The grid does not yet use a true virtualized accessibility model.
- URL synchronization is still a deliberate cut.

## Interface decisions

The interface was kept intentionally dense and work-oriented: fast scanning, stable card dimensions, clear selection state, and a persistent detail panel. The visual system stays close to the supplied product rather than adding unnecessary decoration.

- **Visual system.** Neutral surfaces, compact spacing, simple borders and a restrained accent are defined in `src/styles.css`.
- **Status treatment.** Draft, In review, Approved and Archived use text labels plus pill styling; the label itself remains available so meaning is not dependent on colour alone.
- **States.** Loading, empty results, request errors, offline mode, bulk progress and partial bulk failure each have distinct UI treatment.
- **Contrast.** Focus indicators use a visible outline and status text remains present alongside status styling.
- **Copy.** Error messages were changed from raw technical failures to user-oriented explanations where possible, while preserving useful failure details for bulk operations.

## Trade-offs and cuts

The two main cuts were:

1. **True virtualization** — the grid uses cursor pagination and memoized cards, but loaded cards remain mounted. I would implement `@tanstack/react-virtual` next to meet the full 12,400-row DOM budget.
2. **URL query-state synchronization** — search/filter/sort state is currently local React state. I would move those query controls into a small URL-state hook without putting transient selection/bulk state into the URL.

I also avoided changing the supplied backend or API contract, even where a cleaner server contract would simplify the client.

## Critique of the API

The API is intentionally useful for the assessment but has several client-hostile characteristics:

- Bulk status updates do not accept versions, so the client cannot perform optimistic concurrency control for bulk writes.
- Partial bulk success is returned as a mixed per-item result array, which requires client-side reconciliation and rollback.
- Cursor tokens are query-bound but the server reports a generic `400 stale_cursor`; the client must ensure query changes always restart pagination.
- Rate-limit retries count against the same rate limit, so aggressive automatic retries can amplify the problem.
- Thumbnail availability is known on every asset, but the thumbnail endpoint can still return `404`, requiring defensive rendering.
- There is no server-side search request identity/version, so cancellation has to be handled at the client/fetch layer.

## Anything you would like us to look at

The areas I would especially look at are:

- `src/lib/bulk.ts` — chunking, bounded concurrency, retry/backoff and partial-failure reconciliation.
- `src/api/client.ts` — cancellation, retry classification, `Retry-After` and offline waiting.
- `src/features/assets/AssetCard.tsx` / `AssetGrid.tsx` — memoized cards, lazy thumbnails and keyboard interaction.
- `src/features/assets/AssetDetail.tsx` — version-conflict recovery.

The main remaining engineering follow-up I would take on is true virtualization plus URL-synchronized query state.
