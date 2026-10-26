import type { ComplianceServiceId } from '../../../types/compliance'

/**
 * Where each Compliance row's button goes (e.g. an enrollment or order form). A service with a
 * link here opens it in a new tab, for clients and staff; without one, clients' button asks STS
 * for help (STS is emailed) and staff see the button greyed out. Add each link when STS has it.
 */
export const SERVICE_LINKS: Partial<Record<ComplianceServiceId, string>> = {}
