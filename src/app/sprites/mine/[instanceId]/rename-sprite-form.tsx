"use client";

import { useActionState } from "react";
import {
  renameSpriteInstanceAction,
  type RenameSpriteState,
} from "@/lib/actions/sprite-instance-actions";

const initialState: RenameSpriteState = { error: null, success: false };

export function RenameSpriteForm({
  instanceId,
  initialName,
}: {
  instanceId: string;
  initialName: string;
}) {
  const [state, formAction, pending] = useActionState(
    renameSpriteInstanceAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="instanceId" value={instanceId} />
      <input
        name="name"
        type="text"
        defaultValue={initialName}
        maxLength={30}
        className="rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-blue-600"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Rename"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
