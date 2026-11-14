export type SupportMaintenanceNotice = {
  title: string;
  published_at: string | null;
  expires_at: string | null;
};

/** Only published, current notices may inform support; they do not prove causation. */
export function currentMaintenanceNotices(notices: SupportMaintenanceNotice[], now: number): SupportMaintenanceNotice[] {
  return notices.filter((notice) => {
    if (!notice.published_at) return false;
    const published = Date.parse(notice.published_at);
    const expires = notice.expires_at === null ? Infinity : Date.parse(notice.expires_at);
    return Number.isFinite(published) && published <= now && expires > now;
  });
}