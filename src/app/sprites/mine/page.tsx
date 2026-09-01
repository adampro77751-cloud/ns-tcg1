import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_SPRITE_LEVEL } from "@/lib/xp";
import { AutoRefresh } from "@/components/auto-refresh";

const RARITY_STYLES: Record<string, string> = {
  RARE: "bg-blue-100 text-blue-800",
  MYTHIC: "bg-purple-100 text-purple-800",
  LEGENDARY: "bg-amber-100 text-amber-800",
};

export default async function MySpritesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const instances = await prisma.spriteInstance.findMany({
    where: { ownerId: session.user.id },
    select: {
      id: true,
      name: true,
      level: true,
      obtainedAt: true,
      sprite: { select: { name: true, slug: true, rarity: true } },
      edition: { select: { name: true } },
    },
    orderBy: [{ sprite: { name: "asc" } }, { obtainedAt: "asc" }],
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <AutoRefresh intervalMs={15000} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">My Sprites</h1>
        <Link
          href="/redeem"
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          Redeem a code
        </Link>
      </div>

      {instances.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          You don&apos;t own any Sprites yet.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {instances.map((instance) => (
            <li key={instance.id}>
              <Link
                href={`/sprites/mine/${instance.id}`}
                className="flex flex-col gap-1 rounded border border-zinc-200 p-3 hover:border-zinc-400"
              >
                <span className="font-medium">{instance.name}</span>
                <span className="text-xs text-zinc-500">
                  {instance.sprite.name}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {instance.sprite.rarity && (
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
                        (RARITY_STYLES[instance.sprite.rarity] ??
                          "bg-zinc-100 text-zinc-600")
                      }
                    >
                      {instance.sprite.rarity}
                    </span>
                  )}
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                    {instance.edition.name}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    Level {instance.level}
                    {instance.level >= MAX_SPRITE_LEVEL ? " — MAX LEVEL" : ""}
                  </span>
                  <span>{instance.obtainedAt.toLocaleDateString()}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
