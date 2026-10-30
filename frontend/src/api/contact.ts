import { apiRequest } from './client'

export interface ContactMessage {
  full_name: string
  email: string
  phone: string
  company: string
  usdot: string
  message: string
}

/** Emails the message to STS (bot checks in `humanHeaders`). */
export function sendContactMessage(
  message: ContactMessage,
  humanHeaders: Record<string, string>,
): Promise<unknown> {
  return apiRequest('/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...humanHeaders },
    body: JSON.stringify({
      ...message,
      phone: message.phone.trim() || null,
      company: message.company.trim() || null,
      usdot: message.usdot.trim() || null,
    }),
  })
}
