/**
 * FMCSA's violation groups in everyday words. A group that already reads plainly isn't listed and
 * shows as it is. Labels only name the topic; FMCSA's full text always stays beside them, so they
 * must never say more than the group does.
 */
const GROUP_LABELS: Record<string, string> = {
  // Vehicle Maintenance
  'Brakes All Others': 'Brakes',
  'Brake Out Of Service': 'Brakes (out of service)',
  Lighting: 'Lights',
  'Clearance Identification Lamps/Other': 'Clearance and other lights',
  'Tire vs. Load': 'Tires and load weight',
  'Windshield/ Glass/ Markings': 'Windshield, glass and markings',
  'Inspection Reports': 'Vehicle inspection paperwork',
  'Wheels Studs Clamps Etc.': 'Wheels, studs and clamps',
  'Cab Body Frame': 'Cab, body and frame',
  'Steering Mechanism': 'Steering',
  'Exhaust Discharge': 'Exhaust',
  'Coupling Devices': 'Coupling',
  'Fuel Systems': 'Fuel system',
  'Improper Load Securement': 'Load securement',
  'General Securement': 'Load securement',
  'Securement Device': 'Load securement',
  Tiedown: 'Load tiedowns',
  'Failure to Prevent Movement': 'Load movement',
  'Vehicle Jumping OOS': 'Driving a vehicle placed out of service',
  // Hours of Service
  'Other Log/Form & Manner': 'Logbook form errors',
  'Incomplete/Wrong Log': 'Incomplete or wrong logbook',
  'False Log': 'False logbook',
  'EOBR Related': 'Electronic logging device (ELD)',
  Hours: 'Hours limits',
  'Hours Nominal': 'Hours limits',
  'Fail to transfer ELD records': 'ELD records not transferred',
  'Jumping OOS/Driving Fatigued': 'Driving while out of service or fatigued',
  // Unsafe Driving
  'Speeding 2': 'Speeding',
  'Speeding 3': 'Speeding',
  'Speeding 4': 'Speeding',
  'Speeding Related': 'Speeding',
  'Misc Violations': 'Other driving violations',
  'Phone Call': 'Phone use while driving',
  Texting: 'Texting while driving',
  'HM Related': 'Hazmat driving',
  // Driver Fitness
  'License-related: High': 'Driver license',
  'License-related: Medium': 'Driver license',
  'License-related: Low': 'Driver license',
  'General Driver Qualification': 'Driver qualification',
  Physical: 'Physical qualification',
  // Drugs & Alcohol
  'Alcohol Jumping OOS': 'Alcohol (driving while out of service)',
  // Hazardous materials
  'Documentation - HM': 'Hazmat paperwork',
  'Markings - HM': 'Hazmat markings',
  'Load Securement - HM': 'Hazmat load securement',
  'HM Other': 'Other hazmat',
  'Package Integrity - HM': 'Hazmat packaging',
  'Package Testing - HM': 'Hazmat package testing',
  'Cargo Protection - HM': 'Hazmat cargo protection',
  'HM Route': 'Hazmat route',
  'Fire Hazard - HM': 'Hazmat fire hazard',
}

/** A violation's short everyday name; null when FMCSA's file gives it no group. */
export function plainGroup(group: string | null | undefined): string | null {
  const name = group?.trim()
  return name ? (GROUP_LABELS[name] ?? name) : null
}

/** FMCSA's text after its label, without saying the same word twice ("Tires - Less than…"). */
export function afterLabel(text: string, label: string | null): string {
  if (!label) return text
  const repeated = `${label} - `
  return text.toLowerCase().startsWith(repeated.toLowerCase()) ? text.slice(repeated.length) : text
}
