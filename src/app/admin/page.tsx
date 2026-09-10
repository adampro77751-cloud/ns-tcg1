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
            className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
          >
            <span className="font-medium">Sprite Code Generator</span>
            <span className="text-sm text-slate-500">Generate new codes</span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/sprite-codes#batches"
            className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
          >
            <span className="font-medium">Sprite Code Batches</span>
            <span className="text-sm text-slate-500">View past batches</span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/users"
            className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
          >
            <span className="font-medium">Users</span>
            <span className="text-sm text-slate-500">Ban / unban accounts</span>
          </Link>
        </li>
        <li>
          <Link
            href="/store/orders"
            className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
          >
            <span className="font-medium">Store Orders</span>
            <span className="text-sm text-slate-500">
              View reservations, mark delivered
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
