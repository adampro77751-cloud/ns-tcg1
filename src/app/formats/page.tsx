import { prisma } from "@/lib/prisma";

export default async function FormatsPage() {
  const formats = await prisma.format.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      minDeckSize: true,
      maxDeckSize: true,
      maxCopiesPerCard: true,
      startingHand: true,
      startingHealth: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Formats</h1>
      <p className="mt-2 text-sm text-slate-600">
        Every format&apos;s deck-construction and match-setup rules, pulled
        directly from the format configuration used across the site.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {formats.map((format) => (
          <div
            key={format.id}
            className="rounded border border-sky-200 bg-white p-5"
          >
            <h2 className="text-lg font-semibold">{format.name}</h2>
            {format.description && (
              <p className="mt-1 text-sm text-slate-600">
                {format.description}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Deck size</dt>
                <dd>
                  {format.maxDeckSize && format.maxDeckSize === format.minDeckSize
                    ? format.minDeckSize
                    : format.maxDeckSize
                      ? `${format.minDeckSize}–${format.maxDeckSize}`
                      : `${format.minDeckSize}+`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Starting hand</dt>
                <dd>{format.startingHand}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Starting health</dt>
                <dd>{format.startingHealth}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Max copies/card</dt>
                <dd>{format.maxCopiesPerCard}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
