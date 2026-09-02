"use client";

import { useActionState } from "react";
import Link from "next/link";
import { redeemAction, type RedeemState } from "@/lib/actions/redeem-actions";

const initialState: RedeemState = { error: null, result: null };

export function RedeemForm({ initialCode }: { initialCode: string }) {
  const [state, formAction, pending] = useActionState(
    redeemAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="code" className="text-sm font-medium">
          Code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          required
          placeholder="NS-7K4P-X9QM"
          defaultValue={initialCode}
          autoComplete="off"
          className="rounded border border-sky-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-blue-600"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.result && (
        <p className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Success! You unlocked <strong>{state.result.spriteName}</strong> (
          {state.result.editionName}).{" "}
          <Link
            href={`/sprites/mine/${state.result.instanceId}`}
            className="font-medium underline"
          >
            View it
          </Link>
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Redeeming..." : "Redeem"}
      </button>
    </form>
  );
}
