import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPlayerStats, getRecentMatches } from "@/lib/stats";
import { auth } from "@/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { PlayerProfileContent } from "@/components/player-profile-content";

export default async function PlayerProfilePage({
  params,
}: PageProps<"/player/[username]">) {
  const { username } = await params;

  // Only public-safe fields are selected — never email, passwordHash, or
  // any auth/session data. `role` is selected only to render the "Owner"
  // tag on the Admin account — its raw value is never rendered directly.
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
      profile: { select: { displayName: true, bio: true } },
      decks: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          format: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!user) notFound();

  // Individually owned Sprites — nickname, base Sprite name/rarity, edition,
  // and level only. No redemption-code or batch data is selected here.
  const spriteInstancesPromise = prisma.spriteInstance.findMany({
    where: { ownerId: user.id },
    select: {
      id: true,
      name: true,
      level: true,
      sprite: { select: { name: true, rarity: true } },
      edition: { select: { name: true } },
    },
    orderBy: [{ level: "desc" }, { sprite: { name: "asc" } }],
  });

  const [stats, recentMatches, spriteInstances, session] = await Promise.all([
    getPlayerStats(user.id),
    getRecentMatches(user.id, 10),
    spriteInstancesPromise,
    auth(),
  ]);
  const isOwnProfile = session?.user?.id === user.id;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <AutoRefresh intervalMs={15000} />
      <PlayerProfileContent
        user={user}
        stats={stats}
        spriteInstances={spriteInstances}
        recentMatches={recentMatches}
        isOwnProfile={isOwnProfile}
      />
    </div>
  );
}
