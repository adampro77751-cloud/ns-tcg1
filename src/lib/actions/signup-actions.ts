"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validation";
import { signIn } from "@/auth";

export type SignupState = {
  error: string | null;
};

export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { username, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.user.create({
      data: {
        username,
        email: normalizedEmail,
        passwordHash,
        profile: { create: {} },
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (target.includes("username")) {
        return { error: "That username is already taken." };
      }
      if (target.includes("email")) {
        return { error: "An account with that email already exists." };
      }
    }
    return { error: "Something went wrong creating your account." };
  }

  // Signing in throws a redirect internally on success; let it propagate.
  await signIn("credentials", {
    usernameOrEmail: username,
    password,
    redirectTo: "/",
  });

  return { error: null };
}
