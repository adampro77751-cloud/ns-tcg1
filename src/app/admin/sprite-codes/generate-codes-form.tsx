"use client";

import { useActionState } from "react";
import {
  generateSpriteCodesAction,
  type GenerateCodesState,
} from "@/lib/actions/admin-sprite-code-actions";
import { MIN_CODES_PER_BATCH, MAX_CODES_PER_BATCH } from "@/lib/sprite-code-limits";

const initialState: GenerateCodesState = { error: null };

export function GenerateCodesForm({
  sprites,
  editions,
}: {
  sprites: { id: string; name: string }[];
  editions: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    generateSpriteCodesAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="spriteId" className="text-xs font-medium text-slate-600">
          Sprite
        </label>
        <select
          id="spriteId"
          name="spriteId"
          required
          defaultValue=""
          className="rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        >
          <option value="" disabled>
            Choose a Sprite
          </option>
          {sprites.map((sprite) => (
            <option key={sprite.id} value={sprite.id}>
              {sprite.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="editionId" className="text-xs font-medium text-slate-600">
          Edition
        </label>
        <select
          id="editionId"
          name="editionId"
          required
          defaultValue=""
          className="rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        >
          <option value="" disabled>
            Choose an edition
          </option>
          {editions.map((edition) => (
            <option key={edition.id} value={edition.id}>
              {edition.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="quantity" className="text-xs font-medium text-slate-600">
          Number of codes
        </label>
        <input
          id="quantity"
          name="quantity"
          type="number"
          required
          min={MIN_CODES_PER_BATCH}
          max={MAX_CODES_PER_BATCH}
          defaultValue={100}
          className="w-28 rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Generating..." : "Generate codes"}
      </button>
      {state.error && (
        <p className="w-full text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
