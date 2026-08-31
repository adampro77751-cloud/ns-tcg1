"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  updateProfileAction,
  type ProfileState,
} from "@/lib/actions/profile-actions";

const initialState: ProfileState = { error: null, success: false };

export function EditProfileForm({
  username,
  displayName,
  bio,
}: {
  username: string;
  displayName: string;
  bio: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Username</label>
        <input
          type="text"
          value={username}
          disabled
          className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          maxLength={40}
          defaultValue={displayName}
          className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="bio" className="text-sm font-medium">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          maxLength={280}
          rows={4}
          defaultValue={bio}
          className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-600">Profile updated.</p>
      )}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <Link
          href={`/player/${username}`}
          className="text-sm text-zinc-600 hover:text-black"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
