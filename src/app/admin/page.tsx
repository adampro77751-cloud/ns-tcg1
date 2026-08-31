import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";

export default async function AdminPage() {
  await requireAdminPage();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
      <ul className="mt-6 flex flex-col gap-2">
        <li>
          <Link
            href="/admin/sprite-codes#generate"
            className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:border-zinc-400"
          >
            <span className="font-medium">Sprite Code Generator</span>
            <span className="text-sm text-zinc-500">Generate new codes</span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/sprite-codes#batches"
            className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:border-zinc-400"
          >
            <span className="font-medium">Sprite Code Batches</span>
            <span className="text-sm text-zinc-500">View past batches</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
