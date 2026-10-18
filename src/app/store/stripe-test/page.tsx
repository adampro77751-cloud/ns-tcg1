import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { getTestCheckoutStatus } from "@/lib/stripe-test-checkout";
import { TestCheckoutForm } from "./test-checkout-form";
import { getShopPaymentMode } from "@/lib/stripe";
import { redirect } from "next/navigation";

export default async function StripeTestPage({ searchParams }: {
  searchParams: Promise<{ session_id?: string; cancelled?: string }>;
}) {
  const session = await requireAdminPage();
  if (getShopPaymentMode() !== "test") redirect("/store");
  const params = await searchParams;
  let status: "paid" | "pending" | "error" | null = null;
  if (params.session_id) {
    try { status = await getTestCheckoutStatus(session.user.id, params.session_id); }
    catch { status = "error"; }
  }
  return <div className="mx-auto w-full max-w-2xl px-4 py-12">
    <Link href="/store/packs" className="text-sm text-violet-700">← Pack Store</Link>
    <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Admin · Stripe test mode</p>
      <h1 className="mt-2 text-3xl font-black">Try a test payment</h1>
      <p className="mt-3 text-slate-600">Open Stripe Checkout for a simulated £1 payment. No real money is charged and no Coins, cards or packs are granted.</p>
      <div className="mt-5 rounded-xl bg-white p-4 text-sm">
        <p className="font-semibold">Use this test card on Stripe:</p>
        <p className="mt-2 font-mono text-lg">4242 4242 4242 4242</p>
        <p className="mt-2 text-slate-600">Any future expiry date, any three-digit CVC and any postal code. Use test card details only.</p>
      </div>
      {status === "paid" && <p role="status" className="mt-5 rounded-lg bg-green-100 p-4 font-semibold text-green-900">Test payment successful! Confirmed directly with Stripe.</p>}
      {status === "pending" && <p role="status" className="mt-5 rounded-lg bg-amber-100 p-4 text-amber-900">Payment is not confirmed yet. Refresh this page to check again.</p>}
      {status === "error" && <p role="alert" className="mt-5 rounded-lg bg-red-100 p-4 text-red-900">We could not verify this test payment. Check your Stripe test payments dashboard or try again.</p>}
      {!status && params.cancelled === "1" && <p role="status" className="mt-5 text-sm text-slate-600">Checkout cancelled. You can try again below.</p>}
      <TestCheckoutForm />
    </section>
  </div>;
}
