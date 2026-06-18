import { z } from "zod";

export const SetupInput = z.object({
  targetCountries: z.array(z.string().length(2)).min(1),
  monthlyVolume: z.number().int().min(1),
  useCase: z.string().min(20),
  sampleMessage: z.string().min(20),
  optInDescription: z.string().min(20),
  optInScreenshotPath: z.string().optional(),
});

export type SetupSmsPayload = z.infer<typeof SetupInput>;