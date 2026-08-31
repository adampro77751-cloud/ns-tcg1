import { auth } from "@/auth";
import { RedeemForm } from "./redeem-form";

// Designed so a QR code printed on physical product can simply encode
// /redeem?code=NS-XXXX-XXXX — it lands here and pre-fills the same form,
// with no separate QR-specific redemption path.
export default async function RedeemPage({
  searchParams,
}: PageProps<"/redeem">) {
  const session = await auth();
  const { code } = await searchParams;
  const prefill = typeof code === "string" ? code : "";

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Redeem a code</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Enter the code from your NS TCG product to unlock a Sprite.
      </p>
      {session?.user ? (
        <RedeemForm initialCode={prefill} />
      ) : (
        <p className="mt-6 rounded border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          <a href="/login" className="font-medium text-blue-600">
            Log in
          </a>{" "}
          to redeem a code.
        </p>
      )}
    </div>
  );
}
