import { z } from "zod";

const SenderIdSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const cleaned = value.trim().toUpperCase();
    return cleaned === "" ? undefined : cleaned;
  },
  z
    .string()
    .regex(/^[A-Z0-9]{3,11}$/, "Sender ID must be 3–11 letters or numbers")
    .optional(),
);

export const SetupInput = z.object({
  targetCountries: z.array(z.string().length(2)).min(1),
  monthlyVolume: z.number().int().min(1).default(1000),
  useCase: z.string().trim().optional(),
  sampleMessage: z.string().trim().optional(),
  optInDescription: z.string().trim().optional(),
  optInScreenshotPath: z.string().optional(),
  customSenderId: SenderIdSchema,
});

export type SetupSmsPayload = z.infer<typeof SetupInput>;
