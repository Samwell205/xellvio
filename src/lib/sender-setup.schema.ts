import { z } from "zod";

const SenderIdSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const cleaned = value.trim().toUpperCase();
    return cleaned === "" ? undefined : cleaned;
  },
  z
    .string()
    .regex(/^(?=.*[A-Z])[A-Z0-9 ]{1,11}$/, "Sender ID must be 1–11 letters, numbers, or spaces and include at least one letter")
    .optional(),
);

export const SetupInput = z.object({
  targetCountries: z.array(z.string().length(2)).min(1),
  monthlyVolume: z.number().int().min(1).default(1000),
  useCase: z.string().trim().optional(),
  sampleMessage: z.string().trim().optional(),
  optInDescription: z.string().trim().optional(),
  optInScreenshotPath: z.string().trim().optional(),
  customSenderId: SenderIdSchema,
}).superRefine((data, ctx) => {
  const needsCarrierDetails = data.targetCountries.some((raw) => {
    const cc = raw.toUpperCase();
    return cc === "US" || cc === "CA";
  });
  if (!needsCarrierDetails) return;
  const requiredText: Array<["useCase" | "sampleMessage" | "optInDescription", string, number]> = [
    ["useCase", "Use case details are required for US/Canada carrier review", 40],
    ["sampleMessage", "Sample message is required for US/Canada carrier review", 20],
    ["optInDescription", "Opt-in workflow is required for US/Canada carrier review", 40],
  ];
  for (const [key, message, min] of requiredText) {
    const value = String(data[key] ?? "").trim();
    if (value.length < min) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
  }
  if (!data.optInScreenshotPath?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["optInScreenshotPath"],
      message: "Opt-in proof screenshot is required for US/Canada carrier review",
    });
  }
});

export type SetupSmsPayload = z.infer<typeof SetupInput>;
