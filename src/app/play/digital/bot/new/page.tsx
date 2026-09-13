import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { getActiveFormats, getDecksWithLegality, getOwnedSpriteOptions } from "@/lib/digital-play";
import { createBotMatchAction } from "@/lib/actions/digital-match-actions";
import { BotMatchCreateForm } from "../bot-match-create-form";

export default async function NewBotMatchPage({
  searchParams,
}: PageProps<"/play/digital/bot/new">) {
  const session = await requireAdminPage();
  const search = await searchParams;
  const formatId = typeof search.formatId === "string" ? search.formatId : null;

  const formats = await getActiveFormats();
  const [decks, spriteOptions] = formatId
    ? await Promise.all([
        getDecksWithLegality(session.user.id, formatId),
        getOwnedSpriteOptions(session.user.id),
      ])
    : [[], []];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <Link href="/play/digital" className="text-sm text-blue-600">
        ← Digital Play
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Play vs Bot</h1>
      <p className="mt-1 text-sm text-slate-500">
        Choose a deck and Sprite for yourself, and a separate deck and Sprite
        for the Bot to play with — the Bot is a real second participant with
        its own draw pile, hand, and discard pile.
      </p>

      <div className="mt-6">
        <form action="/play/digital/bot/new" method="GET" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Format
            </label>
            <select
              name="formatId"
              defaultValue={formatId ?? ""}
              className="mt-1 rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
            >
              <option value="" disabled>
                Choose a format...
              </option>
              {formats.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded border border-sky-300 px-4 py-2 text-sm font-medium hover:bg-sky-50"
          >
            Choose format
          </button>
        </form>

        {formatId && decks.length === 0 && (
          <p className="mt-6 text-sm text-slate-500">
            You have no saved decks for this format.{" "}
            <Link href="/decks/new" className="text-blue-600">
              Build one
            </Link>
            . You&apos;ll need at least two (or reuse the same one for both
            sides).
          </p>
        )}

        {formatId && decks.length > 0 && (
          <BotMatchCreateForm
            formatId={formatId}
            decks={decks}
            spriteOptions={spriteOptions}
            action={createBotMatchAction}
          />
        )}
      </div>
    </div>
  );
}
