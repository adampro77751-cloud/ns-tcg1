"use client";

import { useActionState } from "react";
import { startTestCheckout } from "./actions";

export function TestCheckoutForm() {
  const [state, action, pending] = useActionState(startTestCheckout, { error: null });
  return <form action={action} className="mt-6">
    {state.error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
    <button disabled={pending} className="rounded-full bg-violet-600 px-6 py-3 font-bold text-white hover:bg-violet-700 disabled:bg-slate-300">
      {pending ? "Opening Stripe…" : "Try £1 test checkout"}
    </button>
  </form>;
}
