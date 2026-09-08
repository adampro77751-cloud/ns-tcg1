import Link from "next/link";
import { MAX_SPRITE_LEVEL } from "@/lib/xp";
import { SPECIAL_USERNAME_TAGS } from "@/lib/special-tags";
import type { PlayerStats, RecentMatch } from "@/lib/stats";

const RARITY_STYLES: Record<string, string> = {
  RARE: "bg-blue-100 text-blue-800",
  MYTHIC: "bg-purple-100 text-purple-800",
  LEGENDARY: "bg-amber-100 text-amber-800",
};

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-sky-200 bg-white px-4 py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export type PlayerProfileUser = {
  username: string;
  role: string;
  createdAt: Date;
  profile: { displayName: string | null; bio: string | null } | null;
  decks: {
    id: string;
    name: string;
    format: { name: string };
  }[];
};

export type PlayerProfileSpriteInstance = {
  id: string;
  name: string;
  level: number;
  sprite: { name: string; rarity: string | null };
  edition: { name: string };
};

// Shared between /player/[username] (any account, including your own) and
// /players (which shows the logged-in viewer's own profile inline below
// the search UI) — one implementation, so the two can never drift apart.
export function PlayerProfileContent({
  user,
  stats,
  spriteInstances,
  recentMatches,
  isOwnProfile,
}: {
  user: PlayerProfileUser;
  stats: PlayerStats;
  spriteInstances: PlayerProfileSpriteInstance[];
  recentMatches: RecentMatch[];
  isOwnProfile: boolean;
}) {
  const highestLevelSprite = spriteInstances[0] ?? null;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            {user.username}
            {user.role === "ADMIN" && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-800">
                Owner
              </span>
            )}
            {SPECIAL_USERNAME_TAGS[user.username] && (
              <span className="rounded bg-pink-100 px-2 py-0.5 text-xs font-semibold uppercase text-pink-800">
                {SPECIAL_USERNAME_TAGS[user.username]}
              </span>
            )}
          </h1>
          {user.profile?.displayName && (
            <p className="text-slate-600">{user.profile.displayName}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Joined {user.createdAt.toLocaleDateString()}
          </p>
        </div>
        {isOwnProfile && (
          <a
            href="/profile/edit"
            className="rounded border border-sky-300 px-3 py-1.5 text-sm hover:bg-sky-50"
          >
            Edit profile
          </a>
        )}
      </div>

      {user.profile?.bio && (
        <p className="mt-4 max-w-xl text-sm text-slate-700">{user.profile.bio}</p>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Match record
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Matches played" value={String(stats.matchesPlayed)} />
        <StatTile label="Wins" value={String(stats.wins)} />
        <StatTile label="Losses" value={String(stats.losses)} />
        <StatTile label="Win rate" value={`${stats.winPercentage.toFixed(1)}%`} />
      </div>

      {stats.formatRecords.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Record by format
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.formatRecords.map((record) => (
              <StatTile
                key={record.formatSlug}
                label={record.formatName}
                value={`${record.wins}-${record.losses}`}
              />
            ))}
          </div>
        </>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Event record
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Events played" value={String(stats.eventsPlayed)} />
        <StatTile label="Events won" value={String(stats.eventsWon)} />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Sprites
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Sprites owned" value={String(spriteInstances.length)} />
        <StatTile
          label="Highest level Sprite"
          value={
            highestLevelSprite
              ? `${highestLevelSprite.sprite.name} (Lv ${highestLevelSprite.level})`
              : "—"
          }
        />
      </div>
      {spriteInstances.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {spriteInstances.map((instance) => (
            <li
              key={instance.id}
              className="flex flex-col gap-1 rounded border border-sky-200 bg-white p-3"
            >
              <span className="font-medium">{instance.name}</span>
              <span className="text-xs text-slate-500">{instance.sprite.name}</span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {instance.sprite.rarity && (
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
                      (RARITY_STYLES[instance.sprite.rarity] ?? "bg-sky-100 text-slate-600")
                    }
                  >
                    {instance.sprite.rarity}
                  </span>
                )}
                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {instance.edition.name}
                </span>
              </div>
              <span className="mt-1 text-xs text-slate-500">
                Level {instance.level}
                {instance.level >= MAX_SPRITE_LEVEL ? " — MAX LEVEL" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No Sprites owned yet.</p>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Recent matches
      </h2>
      {recentMatches.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No completed matches yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {recentMatches.map((match) => (
            <li key={match.matchId}>
              <Link
                href={`/play/${match.matchId}`}
                className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
              >
                <div>
                  <span
                    className={
                      "mr-2 text-xs font-semibold " +
                      (match.won ? "text-green-700" : "text-red-700")
                    }
                  >
                    {match.won ? "WIN" : "LOSS"}
                  </span>
                  <span className="text-sm">
                    vs{" "}
                    {match.opponentUsername ?? (
                      <span className="text-slate-400">Unknown</span>
                    )}
                  </span>
                  <div className="text-xs text-slate-500">
                    {match.formatName}
                    {match.spriteLabel ? ` · ${match.spriteLabel}` : ""}
                  </div>
                </div>
                <span className="text-xs text-slate-500">
                  {match.date?.toLocaleDateString() ?? ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Decks
      </h2>
      {user.decks.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No saved decks yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {user.decks.map((deck) => (
            <li key={deck.id}>
              <Link
                href={`/decks/${deck.id}`}
                className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
              >
                <span className="font-medium">{deck.name}</span>
                <span className="text-sm text-slate-500">{deck.format.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
