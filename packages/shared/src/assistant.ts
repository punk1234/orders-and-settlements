import { z } from 'zod';

export const assistantQuerySchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'Question is required')
    .max(500, 'Keep questions under 500 characters'),
});

export type AssistantQueryInput = z.infer<typeof assistantQuerySchema>;
