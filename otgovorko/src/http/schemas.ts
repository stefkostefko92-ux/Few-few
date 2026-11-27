import { z } from 'zod';

export const LoginBody = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
  code: z.string().max(12),
});

export const DraftBody = z.object({ text: z.string().min(1).max(20_000) });

export const SentBody = z.object({
  text: z.string().min(1).max(20_000),
  /** Второто потвърждение за рисковите класове (пари, жалба, DSAR, правно). */
  confirmRisk: z.boolean().optional(),
});

export const VoiceBody = z.object({ text: z.string().max(5_000) });

/** Образецът е текст от собственика — обезличен, не копие на писмото до клиента. */
export const SampleBody = z.object({ text: z.string().trim().min(10).max(5_000) });

export const DeleteBody = z.object({ confirm: z.literal(true) });

export const ListQuery = z.object({ from: z.email().max(320).optional() });
