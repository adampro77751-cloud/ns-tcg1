import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function SpritesPage() {
  const session = await auth();

  const [sprites, ownedInstances] = await Promise.all([
    prisma.sprite.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, slug: true, rarity: true, set: true, image: true },
    }),
    session?.user
      ? prisma.spriteInstance.findMany({
          where: { ownerId: session.user.id },
          select: { spriteId: true },
        })
      : Promise.resolve([]),
  ]);

  const ownedCounts = new Map<string, number>();
  for (const row of ownedInstances) {
    ownedCounts.set(row.spriteId, (ownedCounts.get(row.spriteId) ?? 0) + 1);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Sprites</h1>
        <div className="flex items-center gap-3">
          {session?.user && (
            <Link
              href="/sprites/mine"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              My Sprites
            </Link>
          )}
          <Link
            href="/redeem"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Redeem a code
          </Link>
        </div>
      </div>

      {sprites.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">No Sprites yet.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {sprites.map((sprite) => {
            const count = ownedCounts.get(sprite.id) ?? 0;
            return (
              <li key={sprite.id}>
                <Link
                  href={`/sprites/${sprite.slug}`}
                  className="flex flex-col gap-2 rounded border border-zinc-200 p-3 hover:border-zinc-400"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{sprite.name}</span>
                    {session?.user && (
                      <span
                        className={
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
                          (count > 0
                            ? "bg-green-100 text-green-800"
                            : "bg-zinc-100 text-zinc-500")
                        }
                      >
                        {count > 0 ? `Owned ×${count}` : "Not owned"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {[sprite.rarity, sprite.set].filter(Boolean).join(" · ") ||
                      " "}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
