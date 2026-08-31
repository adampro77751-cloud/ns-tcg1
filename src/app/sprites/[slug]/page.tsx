import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function SpriteDetailPage({
  params,
}: PageProps<"/sprites/[slug]">) {
  const { slug } = await params;
  const session = await auth();

  const sprite = await prisma.sprite.findUnique({ where: { slug } });
  if (!sprite) notFound();

  const ownedInstances = session?.user
    ? await prisma.spriteInstance.findMany({
        where: { ownerId: session.user.id, spriteId: sprite.id },
        select: { id: true, name: true, edition: { select: { name: true } } },
        orderBy: { obtainedAt: "asc" },
      })
    : [];
  const owned = ownedInstances.length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{sprite.name}</h1>
          <p className="text-sm text-zinc-500">
            {[sprite.rarity, sprite.set].filter(Boolean).join(" · ")}
          </p>
        </div>
        {session?.user && (
          <span
            className={
              "shrink-0 rounded px-2 py-1 text-xs font-semibold uppercase " +
              (owned
                ? "bg-green-100 text-green-800"
                : "bg-zinc-100 text-zinc-500")
            }
          >
            {owned ? `Owned ×${ownedInstances.length}` : "Not owned"}
          </span>
        )}
      </div>

      {owned && (
        <div className="mt-3 rounded border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-900">
            You own {ownedInstances.length}{" "}
            {ownedInstances.length === 1 ? "copy" : "copies"} of this Sprite.
          </p>
          <Link
            href="/sprites/mine"
            className="mt-1 inline-block text-sm font-medium text-green-800 underline"
          >
            View them in My Sprites
          </Link>
        </div>
      )}

      {sprite.description && (
        <p className="mt-6 text-sm text-zinc-700">{sprite.description}</p>
      )}

      {sprite.rulesText && (
        <div className="mt-6 rounded border border-zinc-200 bg-zinc-50 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Rules text
          </h2>
          <p className="mt-1 text-sm text-zinc-800">{sprite.rulesText}</p>
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        {sprite.set && (
          <div>
            <dt className="text-zinc-500">Set</dt>
            <dd>{sprite.set}</dd>
          </div>
        )}
        {sprite.releaseDate && (
          <div>
            <dt className="text-zinc-500">Release date</dt>
            <dd>{sprite.releaseDate.toLocaleDateString()}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
