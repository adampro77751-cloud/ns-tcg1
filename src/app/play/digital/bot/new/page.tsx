import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { getActiveFormats, getDecksWithLegality, getOwnedSpriteOptions } from "@/lib/digital-play";
import { createBotMatchAction } from "@/lib/actions/digital-match-actions";
import { DigitalSetupForm } from "../../digital-setup-form";

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
        The bot plays a mirrored copy of the same deck you choose — see beta
        limitations.
      </p>

      <div className="mt-6">
        <DigitalSetupForm
          basePath="/play/digital/bot/new"
          formats={formats}
          selectedFormatId={formatId}
          decks={decks}
          spriteOptions={spriteOptions}
          action={createBotMatchAction}
          submitLabel="Start bot match"
        />
      </div>
    </div>
  );
}
