import { z } from "zod";

// Usernames are public and used in URLs (/player/[username]), so keep them
// restricted to a safe, predictable character set.
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(20, "Username must be at most 20 characters.")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username can only contain letters, numbers, and underscores.",
  );

export const emailSchema = z.email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters.");

export const signupSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  usernameOrEmail: z.string().trim().min(1, "Enter your username or email."),
  password: z.string().min(1, "Enter your password."),
});

// Player-given nickname for an individually owned Sprite. Trims whitespace,
// requires non-empty content after trimming, caps length, and rejects
// control characters (unsafe/invisible input) without being overly
// restrictive about legitimate characters (accents, punctuation, etc).
export const spriteInstanceNameSchema = z
  .string()
  .trim()
  .min(1, "Name cannot be empty.")
  .max(30, "Name must be at most 30 characters.")
  .refine(
    (value) => !/[\x00-\x1f\x7f]/.test(value),
    "Name contains characters that aren't allowed.",
  );
