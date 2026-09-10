import { prisma } from "@/lib/prisma";

export default async function RulesPage() {
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
      <h1 className="text-2xl font-bold tracking-tight">NS TCG Rules</h1>

      <Section title="Objective">
        <p>
          Players attempt to reduce their opponent&apos;s health to 0.
          Starting health depends on the format being played — see{" "}
          <a href="#formats" className="text-blue-600">
            Formats
          </a>{" "}
          below for each format&apos;s exact starting health.
        </p>
      </Section>

      <Section title="Card types">
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="font-semibold">Item</dt>
            <dd>
              A permanent card that can have Attack, Defence, and/or Speed.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Spell</dt>
            <dd>A one-time card that resolves its effect.</dd>
          </div>
          <div>
            <dt className="font-semibold">Effect</dt>
            <dd>
              A permanent ongoing effect card with no Attack/Defence/Speed
              stats.
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Turn structure">
        <ol className="list-decimal pl-5">
          <li>Draw</li>
          <li>Remove tired counters</li>
          <li>Play cards</li>
          <li>Attacks</li>
          <li>Speed check</li>
          <li>Defenders</li>
          <li>Damage</li>
          <li>Attackers gain tired counters</li>
        </ol>
      </Section>

      <Section title="Play limits">
        <p>
          Unless another card or game effect changes it, each player may
          play at most 1 Item, 1 Spell, and 1 Effect per turn.
        </p>
      </Section>

      <Section title="Delay">
        <p>
          Delay X means the card cannot be played until X turns have
          passed. For example, Delay 1 means the card cannot be played on
          turn 1.
        </p>
      </Section>

      <Section title="Window">
        <p>Window X limits how late a card may be played.</p>
      </Section>

      <Section title="Relegate">
        <p>
          Relegate X moves the top X cards of the relevant deck into the
          relegated (discard) area.
        </p>
      </Section>

      <Section title="Sprites">
        <ul className="list-disc pl-5">
          <li>Sprites are separate from the normal deck.</li>
          <li>Players can own multiple individual Sprites.</li>
          <li>
            Multiple copies of the same Sprite are separate individual
            Sprites.
          </li>
          <li>Sprites can have player-given names.</li>
          <li>Sprites have individual progression/history.</li>
          <li>Players may select one owned Sprite for a match.</li>
          <li>Players may instead select No Sprite.</li>
          <li>Sprites cannot die.</li>
          <li>Sprites provide their applicable passive/gameplay abilities.</li>
          <li>Match progression belongs to the individual equipped Sprite.</li>
          <li>
            Sprite levels range from Level 1 to Level 5.{" "}
            <strong>Level 5 is the maximum level.</strong> There is no
            Level 6.
          </li>
        </ul>
      </Section>

      <Section title="Formats" id="formats">
        <p>
          Every format&apos;s deck-construction and match-setup rules,
          pulled directly from the format configuration used across the
          site — otherwise follow normal NS TCG rules unless a format
          specifically changes something.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {formats.map((format) => (
            <div
              key={format.id}
              className="rounded border border-sky-200 bg-white p-5"
            >
              <h3 className="font-semibold">{format.name}</h3>
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
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mt-8 scroll-mt-20">
      <h2 className="text-lg font-semibold border-b border-sky-200 pb-1">
        {title}
      </h2>
      <div className="mt-3 text-sm text-slate-700 flex flex-col gap-2">
        {children}
      </div>
    </section>
  );
}
