import { humanize } from '../../../utils/format'

/** Census fields CarrierSafetyScan keeps a change history for, in the words FMCSA uses. */
const ATTRIBUTE_LABEL: Record<string, string> = {
  legal_name: 'Legal name',
  dba_name: 'DBA name',
  entity_type: 'Entity type',
  registration_status: 'USDOT status',
  operation_classification: 'Operation classification',
  email: 'Email',
  fleet_size: 'Power units (MCS-150)',
  driver_count: 'Drivers (MCS-150)',
  safety_rating: 'Safety rating',
  safety_rating_date: 'Safety rating date',
  first_registered_date: 'USDOT add date',
  last_mcs150_date: 'MCS-150 date',
}

/** "dba_name" -> "DBA name"; unknown attributes fall back to a humanized name. */
export function attributeLabel(attribute: string): string {
  return ATTRIBUTE_LABEL[attribute] ?? humanize(attribute)
}
