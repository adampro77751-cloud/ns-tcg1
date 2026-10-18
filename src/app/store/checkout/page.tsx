import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fulfillShopCheckout } from "@/lib/shop";
import { AutoRefresh } from "@/components/auto-refresh";

export default async function CheckoutResultPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { session_id: sessionId } = await searchParams;
  let purchase = null;
  try { if (sessionId) purchase = await fulfillShopCheckout(sessionId, session.user.id); }
  catch { /* No purchase details leave the server when ownership/payment validation fails. */ }
  return <div className="mx-auto w-full max-w-xl px-4 py-12">
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
      <h1 className="text-2xl font-black">{purchase?.fulfilled ? "Purchase added!" : purchase ? "Payment processing" : "Unable to confirm purchase"}</h1>
      {purchase?.fulfilled ? <>
        <p className="mt-4">{purchase.productName} {purchase.setName ? `· ${purchase.setName}` : ""}</p>
        <p className="mt-2 text-sm">{purchase.coins ? `${purchase.coins.toLocaleString()} Coins added to your balance.` : `${purchase.packs} packs added to your Pack Store.`}</p>
        <p className="mt-3 text-xs text-slate-500">Sandbox test purchase. No real money was charged.</p>
      </> : <><p className="mt-4 text-sm">{purchase ? "Your payment is still processing. Items will be added once Stripe confirms payment." : "Refresh to check again. If you completed payment, Stripe’s confirmation will add your items automatically once the webhook is configured."}</p>
        {purchase && <AutoRefresh intervalMs={5000} />}</>}
      <a href="/store/packs" className="mt-6 inline-block rounded-full bg-violet-600 px-5 py-2 font-bold text-white">Go to Pack Store</a>
      <Link href="/store/bundles" className="ml-4 text-sm text-violet-700 underline">Back to bundles</Link>
    </div>
  </div>;
}
