import { z } from 'zod';
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });
export const passwordSchema = z.object({ password: z.string().min(12, 'Use at least 12 characters.').max(128), confirmation: z.string() }).refine(value => value.password === value.confirmation, { message: 'Passwords do not match.', path: ['confirmation'] });
export const staffAccessSchema = z.object({ id: z.uuid(), fullName: z.string().trim().min(1).max(120), role: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/), active: z.boolean() });
export const roleSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/), name: z.string().trim().min(2).max(60) });
export type ActionState = { error?: string; success?: string };
