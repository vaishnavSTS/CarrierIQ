import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createDataQsCase,
  fetchDataQsCase,
  fetchDataQsCases,
  fetchDataQsCheck,
  submitDataQsCase,
  uploadDataQsEvidence,
  type DataQsBase,
} from '../api/dataqs'
import type { DataQsCase, DataQsCaseCreateInput, DataQsSubmitInput } from '../types/dataqs'
import { usePortalMode } from './usePortalMode'

/** DataQs API prefix for the current portal (DataQs is not part of the broker portal). */
export function useDataQsBase(): DataQsBase {
  return usePortalMode() === 'internal' ? '/dataqs' : '/portal/dataqs'
}

/** Where a DataQs case page lives in the current portal. */
export function useDataQsCasePath(): (caseId: number) => string {
  const internal = usePortalMode() === 'internal'
  return (caseId) => (internal ? `/dataqs/cases/${caseId}` : `/portal/dataqs/cases/${caseId}`)
}

export function useDataQsCases() {
  const base = useDataQsBase()
  return useQuery({ queryKey: ['dataqs', base, 'cases'], queryFn: () => fetchDataQsCases(base) })
}

export function useDataQsCase(caseId: number) {
  const base = useDataQsBase()
  return useQuery({
    queryKey: ['dataqs', base, 'case', caseId],
    queryFn: () => fetchDataQsCase(base, caseId),
  })
}

export function useDataQsCheck(usdotNumber: number, inspectionId: string) {
  const base = useDataQsBase()
  return useQuery({
    queryKey: ['dataqs', base, 'check', usdotNumber, inspectionId],
    queryFn: () => fetchDataQsCheck(base, usdotNumber, inspectionId),
    enabled: usdotNumber > 0 && inspectionId.length > 0,
  })
}

/** Every DataQs change answers the updated case: show it at once, refresh the lists. */
function useSaveCase() {
  const base = useDataQsBase()
  const queryClient = useQueryClient()
  return (updated: DataQsCase) => {
    queryClient.setQueryData(['dataqs', base, 'case', updated.id], updated)
    void queryClient.invalidateQueries({ queryKey: ['dataqs', base, 'cases'] })
    void queryClient.invalidateQueries({ queryKey: ['dataqs', base, 'check'] })
  }
}

export function useCreateDataQsCase(usdotNumber: number) {
  const save = useSaveCase()
  return useMutation({
    mutationFn: ({ input, key }: { input: DataQsCaseCreateInput; key: string }) =>
      createDataQsCase(usdotNumber, input, key),
    onSuccess: save,
  })
}

export function useUploadDataQsEvidence(caseId: number) {
  const base = useDataQsBase()
  const save = useSaveCase()
  return useMutation({
    mutationFn: (args: {
      file: File
      links: { issue_id: number; relevance: string }[]
      documentDate: string | null
    }) => uploadDataQsEvidence(base, caseId, args.file, args.links, args.documentDate),
    onSuccess: save,
  })
}

export function useSubmitDataQsCase(caseId: number) {
  const save = useSaveCase()
  return useMutation({
    mutationFn: (input: DataQsSubmitInput) => submitDataQsCase(caseId, input),
    onSuccess: save,
  })
}
