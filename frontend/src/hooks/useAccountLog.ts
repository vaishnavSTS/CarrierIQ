import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'

import { fetchAccountLog, type AccountLogFilter } from '../api/accountLog'

/** The account log, 100 events a page, newest first; fetchNextPage loads older ones. */
export function useAccountLog(filter: AccountLogFilter) {
  return useInfiniteQuery({
    queryKey: ['admin', 'account-log', filter],
    queryFn: ({ pageParam }) => fetchAccountLog(filter, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) =>
      last.has_more ? last.events[last.events.length - 1]?.id : undefined,
    placeholderData: keepPreviousData,
  })
}
