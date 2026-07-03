import type { ComponentType } from 'react'
import { template as tollfreeSubmitted } from './tollfree-submitted'
import { template as tollfreeApproved } from './tollfree-approved'
import { template as tollfreeRejected } from './tollfree-rejected'
import { template as tollfreeInfoRequested } from './tollfree-info-requested'
import { template as teamInvite } from './team-invite'
import { template as generic } from './generic'
import { template as verifierSignupCode } from './verifier-signup-code'
import { template as accountSignupCode } from './account-signup-code'


export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'tollfree-submitted': tollfreeSubmitted,
  'tollfree-approved': tollfreeApproved,
  'tollfree-rejected': tollfreeRejected,
  'tollfree-info-requested': tollfreeInfoRequested,
  'team-invite': teamInvite,
  'generic': generic,
  'verifier-signup-code': verifierSignupCode,
  'account-signup-code': accountSignupCode,
}
