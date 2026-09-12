import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { JoinCodeForm } from "./join-code-form";

export default async function JoinDigitalMatchPage() {
  await requireAdminPage();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <Link href="/play/digital" className="text-sm text-blue-600">
        ← Digital Play
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Join Digital Match</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter the code your opponent shared with you.
      </p>
      <JoinCodeForm />
    </div>
  );
}
