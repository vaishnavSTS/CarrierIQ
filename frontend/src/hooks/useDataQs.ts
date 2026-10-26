import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  approveDataQsPackage,
  assessDataQsCase,
  assignDataQsOwner,
  buildDataQsPackage,
  checkDataQsCorrection,
  closeDataQsFile,
  confirmDataQsCorrection,
  confirmDataQsFiling,
  createDataQsCase,
  createDataQsMissingInspection,
  emailDataQsCarrier,
  fetchDataQsCase,
  fetchDataQsCases,
  fetchDataQsSupervisor,
  fetchDataQsCheck,
  markDataQsOtpUsed,
  requestDataQsOtp,
  setDataQsOtpPreference,
  fetchDataQsStaff,
  overrideDataQsClock,
  proposeDataQsReview,
  recordDataQsCorrespondence,
  requestDataQsPackageChanges,
  resubmitDataQsCase,
  settleDataQsFiling,
  uploadDataQsFilingProof,
  startDataQsFiling,
  submitDataQsCase,
  uploadDataQsEvidence,
  type DataQsBase,
} from '../api/dataqs'
import type {
  DataQsApprovalInput,
  DataQsAssessmentInput,
  DataQsAttemptStartInput,
  DataQsCase,
  DataQsCaseCreateInput,
  DataQsOtpPreferenceInput,
  DataQsConfirmInput,
  DataQsCorrespondenceInput,
  DataQsMissingInspectionInput,
  DataQsPackageInput,
  DataQsSubmitInput,
} from '../types/dataqs'
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

/** STS admins: the supervisor view, refreshed every minute. */
export function useDataQsSupervisor() {
  return useQuery({
    queryKey: ['dataqs', 'supervisor'],
    queryFn: fetchDataQsSupervisor,
    refetchInterval: 60_000,
  })
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
    // While a new email is going out, look again so it shows as sent without a reload.
    // And while STS waits for the carrier's login code, so it shows as soon as it arrives.
    refetchInterval: (query) =>
      query.state.data && (emailGoingOut(query.state.data) || waitingForCode(query.state.data))
        ? 3_000
        : false,
  })
}

/** An email to the carrier from the last two minutes still waiting, with email set up. Older
 * waiting emails are being retried later (minutes apart), so the page stops checking. */
function emailGoingOut(c: DataQsCase): boolean {
  const since = Date.now() - 2 * 60_000
  return (
    c.email_enabled &&
    c.messages.some((m) => m.delivery === 'WAITING' && new Date(m.created_at).getTime() > since)
  )
}

/** STS asked the carrier for the login code and it hasn't come back yet (or expired). */
function waitingForCode(c: DataQsCase): boolean {
  const r = c.otp_request
  return (
    !!r && r.status === 'SENT' && !!r.expires_at && new Date(r.expires_at).getTime() > Date.now()
  )
}

export function useSetDataQsOtpPreference(caseId: number) {
  const save = useSaveCase()
  const base = useDataQsBase()
  return useMutation({
    mutationFn: (input: DataQsOtpPreferenceInput) => setDataQsOtpPreference(base, caseId, input),
    onSuccess: save,
  })
}

export function useRequestDataQsOtp(caseId: number) {
  const save = useSaveCase()
  return useMutation({ mutationFn: () => requestDataQsOtp(caseId), onSuccess: save })
}

export function useMarkDataQsOtpUsed(caseId: number) {
  const save = useSaveCase()
  return useMutation({
    mutationFn: (requestId: number) => markDataQsOtpUsed(caseId, requestId),
    onSuccess: save,
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
  const base = useDataQsBase()
  return useMutation({
    mutationFn: ({ input, key }: { input: DataQsCaseCreateInput; key: string }) =>
      createDataQsCase(base, usdotNumber, input, key),
    onSuccess: save,
  })
}

export function useCreateDataQsMissingInspection(usdotNumber: number) {
  const save = useSaveCase()
  return useMutation({
    mutationFn: ({ input, key }: { input: DataQsMissingInspectionInput; key: string }) =>
      createDataQsMissingInspection(usdotNumber, input, key),
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
      title: string | null
    }) => uploadDataQsEvidence(base, caseId, args.file, args.links, args.documentDate, args.title),
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

// --- Phase 3 ----------------------------------------------------------------------------------

/** Staff only: who a case can be assigned to. */
export function useDataQsStaff() {
  return useQuery({ queryKey: ['dataqs', 'staff'], queryFn: fetchDataQsStaff, staleTime: 300_000 })
}

/** A DataQs change that answers the updated case. */
function useCaseAction<T>(action: (input: T) => Promise<DataQsCase>) {
  const save = useSaveCase()
  return useMutation({ mutationFn: action, onSuccess: save })
}

export function useAssignDataQsOwner(caseId: number) {
  return useCaseAction(({ version, ownerId }: { version: number; ownerId: number | null }) =>
    assignDataQsOwner(caseId, version, ownerId),
  )
}

export function useAssessDataQsCase(caseId: number) {
  return useCaseAction((input: DataQsAssessmentInput) => assessDataQsCase(caseId, input))
}

export function useBuildDataQsPackage(caseId: number) {
  return useCaseAction((input: DataQsPackageInput) => buildDataQsPackage(caseId, input))
}

export function useResubmitDataQsCase(caseId: number) {
  return useCaseAction((version: number) => resubmitDataQsCase(caseId, version))
}

export function useApproveDataQsPackage(caseId: number) {
  return useCaseAction((input: DataQsApprovalInput) => approveDataQsPackage(caseId, input))
}

export function useRequestDataQsPackageChanges(caseId: number) {
  return useCaseAction(({ version, message }: { version: number; message: string }) =>
    requestDataQsPackageChanges(caseId, version, message),
  )
}

// --- Phase 4: manual filing --------------------------------------------------------------------

export function useStartDataQsFiling(caseId: number) {
  return useCaseAction(({ input, key }: { input: DataQsAttemptStartInput; key: string }) =>
    startDataQsFiling(caseId, input, key),
  )
}

export function useConfirmDataQsFiling(caseId: number) {
  return useCaseAction(({ attemptId, input }: { attemptId: number; input: DataQsConfirmInput }) =>
    confirmDataQsFiling(caseId, attemptId, input),
  )
}

export function useUploadDataQsFilingProof(caseId: number) {
  return useCaseAction(({ attemptId, file }: { attemptId: number; file: File }) =>
    uploadDataQsFilingProof(caseId, attemptId, file),
  )
}

export function useSettleDataQsFiling(caseId: number) {
  return useCaseAction(
    ({
      attemptId,
      action,
      note,
    }: {
      attemptId: number
      action: 'unconfirmed' | 'abandon'
      note: string
    }) => settleDataQsFiling(caseId, attemptId, action, note),
  )
}

// --- Phase 5: agency events, appeals, deadlines ------------------------------------------------

export function useRecordDataQsCorrespondence(caseId: number) {
  return useCaseAction((input: DataQsCorrespondenceInput) =>
    recordDataQsCorrespondence(caseId, input),
  )
}

export function useProposeDataQsReview(caseId: number) {
  return useCaseAction(
    ({ version, grounds, issueIds }: { version: number; grounds: string; issueIds: number[] }) =>
      proposeDataQsReview(caseId, version, grounds, issueIds),
  )
}

export function useOverrideDataQsClock(caseId: number) {
  return useCaseAction(
    ({
      clockId,
      version,
      dueAt,
      reason,
    }: {
      clockId: number
      version: number
      dueAt: string
      reason: string
    }) => overrideDataQsClock(caseId, clockId, version, dueAt, reason),
  )
}

// --- Emails to the carrier, closing the file ---------------------------------------------------

export function useEmailDataQsCarrier(caseId: number) {
  return useCaseAction(({ subject, body }: { subject: string; body: string }) =>
    emailDataQsCarrier(caseId, subject, body),
  )
}

export function useCloseDataQsFile(caseId: number) {
  return useCaseAction(
    ({ version, note, reason }: { version: number; note: string; reason?: string }) =>
      closeDataQsFile(caseId, version, note, reason),
  )
}

export function useCheckDataQsCorrection(caseId: number) {
  return useCaseAction(() => checkDataQsCorrection(caseId))
}

export function useConfirmDataQsCorrection(caseId: number) {
  return useCaseAction(({ issueId, note }: { issueId: number; note: string }) =>
    confirmDataQsCorrection(caseId, issueId, note),
  )
}
