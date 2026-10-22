/** Reopening a saved draft resumes at the first step still missing content. */
export function campaignDraftResumeStep(input: {
  status: string;
  name: string;
  body: string;
  hasAudience: boolean;
  sendMode: string;
  scheduleAt: string | null;
}): 0 | 1 | 2 | 3 {
  if (input.status !== "draft") return 0;
  if (input.name.trim() === "" || !input.hasAudience) return 0;
  if (input.body.trim() === "") return 1;
  if (input.sendMode === "scheduled" && !input.scheduleAt) return 2;
  return 3;
}

/** A saved assistant draft can skip setup, never the required test and confirmation. */
export function assistantLaunchStep(input: {
  requested: boolean;
  status: string;
  name: string;
  body: string;
  hasAudience: boolean;
}): 0 | 3 {
  return input.requested && input.status === "draft" && input.name.trim() !== "" &&
    input.body.trim() !== "" && input.hasAudience ? 3 : 0;
}