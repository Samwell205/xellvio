import * as React from 'react';
import catalog from './owner-designs/catalog.json';

type Node = string | { tag: string; attrs: Record<string, unknown>; children: Node[] };
type Design = { tree: Node; generic: Node; subject: string };
export const OWNER_DESIGNS = catalog as unknown as Record<string, Design>;

const aliases: Record<string, string> = {
  'tollfree-submitted': 'tfv-submitted', 'tollfree-approved': 'tfv-approved',
  'tollfree-rejected': 'tfv-rejected', 'tollfree-info-requested': 'tfv-more-info',
  'account-signup-code': 'signup-code', 'verifier-signup-code': 'verifier-code',
  signup: 'email-confirm', invite: 'account-invite', magiclink: 'passwordless',
  recovery: 'password-reset', email_change: 'email-change', reauthentication: 'reauth',
  plan_usage_warning: 'plan-usage', feature_discovery_automation: 'automation-discovery',
  upgrade_recommendation: 'upgrade',
};

export function ownerDesignKey(key: string): string {
  return aliases[key] ?? key.replaceAll('_', '-');
}

function filled(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(data[key] ?? ''));
}

function safeUrl(value: string): string | undefined {
  return /^(https:\/\/|mailto:)/i.test(value) ? value : undefined;
}

function renderNode(node: Node, data: Record<string, unknown>, key = 'root'): React.ReactNode {
  if (typeof node === 'string') return filled(node, data);
  if (['script', 'style', 'iframe', 'object', 'embed', 'noscript'].includes(node.tag)) return null;
  const attrs: Record<string, unknown> = { ...node.attrs, key };
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith('on')) { delete attrs[name]; continue; }
    if (typeof value === 'string') attrs[name] = filled(value, data);
  }
  if (node.tag === 'a') {
    const href = safeUrl(String(attrs.href ?? ''));
    if (!href) return null;
    attrs.href = href;
  }
  if (node.tag === 'img') {
    const src = safeUrl(String(attrs.src ?? ''));
    if (!src?.startsWith('https://')) return null;
    attrs.src = src;
  }
  if (node.tag === 'body') attrs.style = { ...(attrs.style as object), backgroundColor: '#ffffff' };
  const children = node.children.map((child, i) => renderNode(child, data, `${key}-${i}`));
  const voidTag = ['img', 'meta', 'br', 'hr', 'link', 'input'].includes(node.tag);
  return React.createElement(node.tag, attrs, ...(voidTag ? [] : children));
}

/** Owner artwork is a trusted static React tree; recipient values remain escaped React text/attributes. */
export default function OwnerEmailDesign({ designKey, generic = false, ...data }: Record<string, any>) {
  const design = OWNER_DESIGNS[ownerDesignKey(String(designKey))] ?? OWNER_DESIGNS['ticket-reply'];
  if (!design) return null;
  const vars = {
    firstName: 'there', first_name: 'there', businessName: 'your business', siteName: 'Xellvio',
    expiresMinutes: '10', dashboardUrl: 'https://xellvio.com/app', eyebrow: 'Xellvio',
    ...data, inviteUrl: data.inviteUrl ?? data.acceptUrl ?? data.confirmationUrl,
    token: data.token ?? data.code, recipient: data.recipient ?? data.email,
    preview: data.preview ?? data.heading ?? data.subject ?? 'Xellvio notification',
    body: [data.body, data.toneBody].filter(Boolean).join('\n\n'),
  };
  return renderNode(generic ? design.generic : design.tree, vars);
}

export function ownerComponent(designKey: string) {
  return function OwnerComponent(data: Record<string, any>) {
    return <OwnerEmailDesign {...data} designKey={designKey} />;
  };
}

export function resolveGenericDesign(data: Record<string, any>, eventKey = ''): string {
  if (typeof data.designKey === 'string') return ownerDesignKey(data.designKey);
  if (eventKey.startsWith('lifecycle-')) {
    const match = eventKey.match(/^lifecycle-(.+)-[0-9a-f-]{36}$/i);
    if (match?.[1]) return ownerDesignKey(match[1]);
  }
  if (eventKey.startsWith('account-status-')) {
    for (const kind of ['account_suspended', 'account_restored', 'sending_suspended', 'sending_restored']) {
      if (eventKey.includes(`-${kind}-`)) return ownerDesignKey(kind);
    }
  }
  if (eventKey.startsWith('ticket-') && !eventKey.startsWith('ticket-admin-')) {
    if (eventKey.includes('-autoclose-')) return 'ticket-autoclosed';
    if (eventKey.includes('-reminder2-')) return 'ticket-reminder-2';
    if (eventKey.includes('-reminder1-')) return 'ticket-reminder-1';
    if (eventKey.includes('-consolidated-')) return 'ticket-consolidated';
    if (eventKey.includes('-merged-')) return 'ticket-merged';
    if (eventKey.includes('-assisted-')) return 'ticket-assisted';
    if (eventKey.includes('-resolved-')) return 'ticket-resolved';
    if (eventKey.includes('-closed-')) return 'ticket-closed';
    if (eventKey.endsWith('-opened')) return 'ticket-received';
    return 'ticket-reply';
  }
  if (eventKey.startsWith('payment-receipt-')) return 'payment-receipt';
  if (eventKey.startsWith('np-credited-') && !eventKey.startsWith('np-credited-admin-')) return 'crypto-credited';
  if (eventKey.startsWith('financial-recovery-')) return 'billing-review';
  if (eventKey.startsWith('mkt-sold-')) return 'number-sold';
  if (eventKey.startsWith('mkt-bought-')) return 'number-ready';
  return 'ticket-reply';
}