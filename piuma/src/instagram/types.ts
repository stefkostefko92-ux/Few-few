import { z } from 'zod';

export const shortLivedTokenSchema = z.object({
  access_token: z.string().min(1),
  user_id: z.union([z.string(), z.number()]).transform(String),
  permissions: z.string().optional(),
});

export const longLivedTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive(),
});

export const profileSchema = z.object({
  id: z.string(),
  username: z.string(),
  account_type: z.string().optional(),
});

export const containerSchema = z.object({ id: z.string().min(1) });

export const containerStatusSchema = z.object({
  id: z.string(),
  status_code: z.enum(['EXPIRED', 'ERROR', 'FINISHED', 'IN_PROGRESS', 'PUBLISHED']),
  status: z.string().optional(),
});

export const publishedMediaSchema = z.object({ id: z.string().min(1) });

export const mediaDetailsSchema = z.object({
  id: z.string(),
  permalink: z.string().optional(),
});

export const publishingLimitSchema = z.object({
  data: z
    .array(
      z.object({
        quota_usage: z.number().int().nonnegative(),
        config: z.object({ quota_total: z.number().int().positive() }).optional(),
      }),
    )
    .default([]),
});

export type ShortLivedToken = z.infer<typeof shortLivedTokenSchema>;
export type LongLivedToken = z.infer<typeof longLivedTokenSchema>;
export type InstagramProfile = z.infer<typeof profileSchema>;
export type ContainerStatus = z.infer<typeof containerStatusSchema>;
