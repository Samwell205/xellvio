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