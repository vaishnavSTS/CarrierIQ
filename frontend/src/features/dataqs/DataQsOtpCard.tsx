import { useState } from 'react'

import type { DataQsCase } from '../../types/dataqs'
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
          STS gets the code by: <span className="font-medium">{otpChoiceText(choice)}</span>.
        </p>
      ) : (
        <p className="text-slate-700">
          To file your request, STS logs in to FMCSA, which sends a one-time code to you. Choose how
          you’d like to pass it to us.
        </p>
      )}
      {c.can_set_otp_preference && (
        <button type="button" onClick={() => setOpen(true)} className={secondaryButton}>
          {choice ? 'Change' : 'Choose how'}
        </button>
      )}
      {open && <DataQsOtpChoiceDialog dataqsCase={c} onClose={() => setOpen(false)} />}
    </div>
  )
}
