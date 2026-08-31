"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type ProfileState = {
  error: string | null;
  success: boolean;
};

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(40, "Display name must be at most 40 characters.")
    .optional()
    .or(z.literal("")),
  bio: z
    .string()
    .trim()
    .max(280, "Bio must be at most 280 characters.")
    .optional()
    .or(z.literal("")),
});

export async function updateProfileAction(
  _prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "You must be logged in.", success: false };
  }

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    bio: formData.get("bio"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
      success: false,
    };
  }

  // The row to update is derived from the authenticated session, never from
  // client input, so a user can only ever edit their own profile.
  await prisma.playerProfile.update({
    where: { userId: session.user.id },
    data: {
      displayName: parsed.data.displayName || null,
      bio: parsed.data.bio || null,
    },
  });

  revalidatePath(`/player/${session.user.username}`);

  return { error: null, success: true };
}
