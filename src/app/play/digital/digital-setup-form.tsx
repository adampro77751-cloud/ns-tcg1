import Link from "next/link";
import type { DigitalFormState } from "@/lib/actions/digital-match-actions";
import { DigitalCreateForm } from "./digital-create-form";

type Format = { id: string; name: string; startingHand: number; startingHealth: number };
type DeckWithLegality = {
  id: string;
  name: string;
  legality: { legal: boolean; errors: string[] };
};
type SpriteOption = { id: string; label: string };

// Shared by /play/digital/bot/new and /play/digital/online/new — format
// picker (GET, reloads with ?formatId=… since legal decks depend on the
// server re-checking legality for that format) then a deck/Sprite picker
// posting to the real create action. Illegal decks are shown disabled with
// their reason rather than hidden, per spec (helps test the format system).
export function DigitalSetupForm({
  basePath,
  formats,
  selectedFormatId,
  decks,
  spriteOptions,
  action,
  submitLabel,
}: {
  basePath: string;
  formats: Format[];
  selectedFormatId: string | null;
  decks: DeckWithLegality[];
  spriteOptions: SpriteOption[];
  action: (state: DigitalFormState, formData: FormData) => Promise<DigitalFormState>;
  submitLabel: string;
}) {
  return (
    <div>
      <form action={basePath} method="GET" className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Format
          </label>
          <select
            name="formatId"
            defaultValue={selectedFormatId ?? ""}
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

      {selectedFormatId && decks.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          You have no saved decks for this format.{" "}
          <Link href="/decks/new" className="text-blue-600">
            Build one
          </Link>
          .
        </p>
      )}

      {selectedFormatId && decks.length > 0 && (
        <DigitalCreateForm
          hiddenFields={{ formatId: selectedFormatId }}
          decks={decks}
          spriteOptions={spriteOptions}
          action={action}
          submitLabel={submitLabel}
        />
      )}
    </div>
  );
}
