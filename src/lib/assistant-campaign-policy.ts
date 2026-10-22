export function canConfirmAssistantCampaign(input: {
  choice: "none" | "tested" | "skipped";
  consent: boolean;
  blocked: boolean;
}) {
  return input.choice !== "none" && input.consent && !input.blocked;
}
