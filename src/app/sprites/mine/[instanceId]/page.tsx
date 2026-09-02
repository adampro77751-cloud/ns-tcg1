import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { xpProgress } from "@/lib/xp";
import { getSpriteInstanceMatchStats } from "@/lib/sprite-stats";
import { RenameSpriteForm } from "./rename-sprite-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { LevelAbilities } from "@/components/sprite-level-abilities";

const RARITY_STYLES: Record<string, string> = {
  RARE: "bg-blue-100 text-blue-800",
  MYTHIC: "bg-purple-100 text-purple-800",
  LEGENDARY: "bg-amber-100 text-amber-800",
};

function describeHistoryEntry(
  type: string,
  detail: unknown,
): string {
  const d = (detail ?? {}) as Record<string, unknown>;
  switch (type) {
    case "OBTAINED":
      if (d.migratedFromAggregateOwnership) {
        return "Obtained (converted from earlier aggregate ownership record).";
      }
      return "Obtained via redemption code.";
    case "RENAMED":
      return `Renamed from "${String(d.previousName ?? "?")}" to "${String(d.newName ?? "?")}".`;
    case "LEVEL_UP":
      return `Leveled up from ${String(d.previousLevel ?? "?")} to ${String(d.newLevel ?? "?")}${d.maxLevel ? " — MAX LEVEL" : ""}.`;
    case "MATCH_WON": {
      const noun = d.source === "EVENT" ? "event" : "match";
      return `Won a ${String(d.formatName ?? "")} ${noun}.`.replace(/\s+/g, " ");
    }
    case "MATCH_PLAYED": {
      const noun = d.source === "EVENT" ? "event" : "match";
      return `Played a ${String(d.formatName ?? "")} ${noun}.`.replace(/\s+/g, " ");
    }
    case "XP_GAINED":
      return `+${String(d.xpGained ?? "?")} XP (total ${String(d.totalXp ?? "?")}).`;
    default:
      return type;
  }
}

export default async function SpriteInstancePage({
  params,
}: PageProps<"/sprites/mine/[instanceId]">) {
  const { instanceId } = await params;
  const session = await auth();

  const instance = await prisma.spriteInstance.findUnique({
    where: { id: instanceId },
    select: {
      id: true,
      name: true,
      level: true,
      xp: true,
      obtainedAt: true,
      obtainedMethod: true,
      ownerId: true,
      owner: { select: { username: true } },
      sprite: {
        select: {
          name: true,
          slug: true,
          rarity: true,
          image: true,
          description: true,
          rulesText: true,
          level1Ability: true,
          level2Ability: true,
          level3Ability: true,
          level4Ability: true,
          level5Ability: true,
        },
      },
      edition: { select: { name: true } },
      history: {
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, detail: true, createdAt: true },
      },
    },
  });
  if (!instance) notFound();

  const isOwner = session?.user?.id === instance.ownerId;
  const progress = xpProgress(instance.xp);
  const stats = await getSpriteInstanceMatchStats(instance.id);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <AutoRefresh intervalMs={15000} />
      <Link
        href={isOwner ? "/sprites/mine" : `/sprites/${instance.sprite.slug}`}
        className="text-sm text-blue-600"
      >
        {isOwner ? "← My Sprites" : `← ${instance.sprite.name}`}
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          {isOwner ? (
            <RenameSpriteForm instanceId={instance.id} initialName={instance.name} />
          ) : (
            <h1 className="text-3xl font-bold tracking-tight">{instance.name}</h1>
          )}
          <p className="mt-1 text-sm text-slate-500">
            {instance.sprite.name}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {instance.sprite.rarity && (
          <span
            className={
              "rounded px-2 py-1 text-xs font-semibold uppercase " +
              (RARITY_STYLES[instance.sprite.rarity] ?? "bg-sky-100 text-slate-600")
            }
          >
            {instance.sprite.rarity}
          </span>
        )}
        <span className="rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-slate-600">
          {instance.edition.name}
        </span>
        <span
          className={
            "rounded px-2 py-1 text-xs font-semibold " +
            (progress.isMaxLevel
              ? "bg-amber-100 text-amber-800"
              : "bg-sky-100 text-slate-600")
          }
        >
          Level {instance.level}
          {progress.isMaxLevel ? " — MAX LEVEL" : ""}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {instance.xp} XP total
        {!progress.isMaxLevel &&
          progress.xpForNextLevel !== null &&
          ` · ${progress.xpForNextLevel - progress.xpIntoLevel} XP to Level ${progress.nextLevel}`}
      </p>

      {instance.sprite.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={instance.sprite.image}
          alt={instance.sprite.name}
          className="mt-6 max-h-80 rounded border border-sky-200 object-contain"
        />
      )}

      {instance.sprite.description && (
        <p className="mt-6 text-sm text-slate-700">{instance.sprite.description}</p>
      )}

      {instance.sprite.rulesText && (
        <div className="mt-4 rounded border border-sky-200 bg-sky-50 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Rules text
          </h2>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-800">
            {instance.sprite.rulesText}
          </p>
        </div>
      )}

      <LevelAbilities sprite={instance.sprite} currentLevel={instance.level} />

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Owner</dt>
          <dd>
            <Link
              href={`/player/${instance.owner.username}`}
              className="text-blue-600 hover:underline"
            >
              {instance.owner.username}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Date obtained</dt>
          <dd>{instance.obtainedAt.toLocaleDateString()}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Matches played</dt>
          <dd>{stats.matchesPlayed}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Matches won</dt>
          <dd>{stats.matchesWon}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Events played</dt>
          <dd>{stats.eventsPlayed}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Events won</dt>
          <dd>{stats.eventsWon}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Win rate</dt>
          <dd>{stats.winRate.toFixed(0)}%</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        History
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {instance.history.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between rounded border border-sky-200 bg-white px-3 py-2 text-sm"
          >
            <span>{describeHistoryEntry(entry.type, entry.detail)}</span>
            <span className="shrink-0 text-xs text-slate-500">
              {entry.createdAt.toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
