import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { getActiveFormats, getDecksWithLegality, getOwnedSpriteOptions } from "@/lib/digital-play";
import { createOnlineMatchAction } from "@/lib/actions/digital-match-actions";
import { DigitalSetupForm } from "../../digital-setup-form";

export default async function NewOnlineMatchPage({
  searchParams,
}: PageProps<"/play/digital/online/new">) {
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
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Create Online Match</h1>
      <p className="mt-1 text-sm text-slate-500">
        Choose a format and deck, then share the generated code with your
        opponent.
      </p>

      <div className="mt-6">
        <DigitalSetupForm
          basePath="/play/digital/online/new"
          formats={formats}
          selectedFormatId={formatId}
          decks={decks}
          spriteOptions={spriteOptions}
          action={createOnlineMatchAction}
          submitLabel="Create match"
        />
      </div>
    </div>
  );
}
