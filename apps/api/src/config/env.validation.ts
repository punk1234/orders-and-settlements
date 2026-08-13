import { z } from 'zod';

/**
 * Fail fast on boot if required config is missing, instead of failing
 * confusingly deep in the stack the first time something tries to use it
 * (e.g. Mongoose connecting to `undefined`, or JWTs signed with an empty
 * secret). Reuses zod rather than adding a separate validation library,
 * since the rest of the API already validates everything else with it.
 */
const envSchema = z.object({
  MONGO_URI: z.string().trim().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z
    .string()
    .trim()
    .min(16, 'JWT_SECRET should be at least 16 characters (it signs every session token)'),
  PORT: z.string().optional(),
  FRONTEND_ORIGIN: z.string().optional(),
  NODE_ENV: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
});

export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return result.data;
}
