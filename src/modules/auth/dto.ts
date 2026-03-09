import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(6).max(128),
  phone: z.string().trim().max(30).optional(),
  position: z.string().trim().max(80).optional()
});

export const forgotPasswordSchema = z.object({
  username: z.string().trim().min(1)
});

export const resetPasswordSchema = z.object({
  username: z.string().trim().min(1),
  token: z.string().trim().min(1),
  newPassword: z.string().min(6).max(128)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});
