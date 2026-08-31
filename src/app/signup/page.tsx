"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type SignupState } from "@/lib/actions/signup-actions";

const initialState: SignupState = { error: null };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState,
  );

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight">Create account</h1>
        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              autoComplete="username"
              className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
            />
            <p className="text-xs text-zinc-500">
              3-20 characters: letters, numbers, underscores.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
            />
            <p className="text-xs text-zinc-500">At least 8 characters.</p>
          </div>
          {state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "Creating account..." : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-sm text-zinc-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-600">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
