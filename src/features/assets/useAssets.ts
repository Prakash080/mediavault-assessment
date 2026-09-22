import { useCallback } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { listAssets } from '@/api/client';

import type { Asset, AssetQuery } from '@/lib/types';

export function useAssets(query: AssetQuery) {
  const queryClient = useQueryClient();

  const queryKey = [
    'assets',
    {
      q: query.q ?? '',
      status: query.status ?? [],
      kind: query.kind ?? [],
      tag: query.tag ?? [],
      collectionId: query.collectionId ?? '',
      owner: query.owner ?? '',
      sort: query.sort ?? '',
      limit: query.limit ?? 24,
    },
  ];

  const assetsQuery = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listAssets(
        {
          ...query,
          cursor: pageParam ?? undefined,
        },
        signal,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
    retry: false,
  });

  const pages = assetsQuery.data?.pages ?? [];

  const items = pages.flatMap((page) => page.items);

  const total = pages[0]?.total ?? 0;

  const nextCursor =
    pages.length > 0
      ? pages[pages.length - 1]?.nextCursor ?? null
      : null;

  const updateAssetsInCache = useCallback(
    (updatedAssets: Asset[]) => {
      if (updatedAssets.length === 0) return;

      const updates = new Map(
        updatedAssets.map((asset) => [asset.id, asset]),
      );

      queryClient.setQueryData(
        queryKey,
        (current:
          | {
              pages: Array<{
                items: Asset[];
                total: number;
                nextCursor: string | null;
              }>;
              pageParams: unknown[];
            }
          | undefined) => {
          if (!current) return current;

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map(
                (asset) => updates.get(asset.id) ?? asset,
              ),
            })),
          };
        },
      );
    },
    [queryClient, queryKey],
  );

  return {
    items,
    total,
    nextCursor,

    loading: assetsQuery.isLoading,

    error:
      assetsQuery.error instanceof Error
        ? assetsQuery.error.message
        : assetsQuery.error
          ? 'Something went wrong'
          : null,

    hasNextPage: assetsQuery.hasNextPage,
    isFetchingNextPage: assetsQuery.isFetchingNextPage,

    fetchNextPage: assetsQuery.fetchNextPage,

    refetch: assetsQuery.refetch,

    updateAssetsInCache,
  };
}