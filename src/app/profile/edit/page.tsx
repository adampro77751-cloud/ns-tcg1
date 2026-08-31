import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { EditProfileForm } from "./edit-profile-form";

export default async function EditProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: session.user.id },
    select: { displayName: true, bio: true },
  });

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Edit profile</h1>
      <EditProfileForm
        username={session.user.username}
        displayName={profile?.displayName ?? ""}
        bio={profile?.bio ?? ""}
      />
    </div>
  );
}
