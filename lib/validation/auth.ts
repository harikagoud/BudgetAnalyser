import { z } from 'zod';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128; // bounds scrypt work per request

export const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

export function validateCredentials(input: unknown) {
  return CredentialsSchema.safeParse(input);
}

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export const DeleteAccountSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const EmailOnlySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(1).max(2048),
  password: z.string().min(1).max(PASSWORD_MAX),
});
