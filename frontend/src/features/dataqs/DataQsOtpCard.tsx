import { useState } from 'react'

import type { DataQsCase } from '../../types/dataqs'
import { DataQsAgentAccessCard } from './DataQsAgentAccess'
import { DataQsOtpChoiceDialog } from './DataQsOtpChoiceDialog'
import { otpChoiceText } from './labels'
import { secondaryButton } from './ui'

/**
 * The carrier's portal: how they give STS the FMCSA login code. The choice pops up by itself
 * once the request is submitted and nothing is chosen yet.
 */
export function DataQsOtpCard({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const [open, setOpen] = useState(c.can_set_otp_preference && c.otp_preference === null)
  const choice = c.otp_preference
  return (
    <div className="space-y-3 text-sm">
      {choice ? (
        <p className="text-slate-700">
          Your choice: <span className="font-medium">{otpChoiceText(choice)}</span>.
        </p>
      ) : (
        <p className="text-slate-700">
          To file your request, STS signs in to FMCSA. Choose how: authorize STS as an agent in the
          FMCSA Portal, or pass STS the one-time code FMCSA sends you.
        </p>
      )}
      {c.agent && <DataQsAgentAccessCard dataqsCase={c} />}
      {c.can_set_otp_preference && c.agent?.status !== 'GRANTED' && (
        <button type="button" onClick={() => setOpen(true)} className={secondaryButton}>
          {choice ? 'Change' : 'Choose how'}
        </button>
      )}
      {open && <DataQsOtpChoiceDialog dataqsCase={c} onClose={() => setOpen(false)} />}
    </div>
  )
}
