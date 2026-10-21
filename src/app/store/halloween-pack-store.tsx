"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HALLOWEEN_STYLES, HALLOWEEN_PACK_COST, isHalloweenPackAvailable } from "@/lib/card-style-catalog";
import { buyHalloweenPackAction } from "@/lib/actions/pack-actions";
import type { PackOpeningResult } from "@/lib/packs";
import { PackRevealModal } from "./packs/pack-reveal-modal";

export function HalloweenPackStore({ balance, signedIn, available }: { balance: number; signedIn: boolean; available: boolean }) {
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<PackOpeningResult | null>(null);
  async function buy() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true); setError(null);
    try {
      if (!isHalloweenPackAvailable()) throw new Error("The Halloween pack sale has ended.");
      requestKey.current ??= crypto.randomUUID();
      const form = new FormData(); form.set("requestKey", requestKey.current);
      const result = await buyHalloweenPackAction(form);
      setReveal(result);
      requestKey.current = null;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not open your pack. Please try again.");
    } finally { setPending(false); inFlight.current = false; }
  }
  return <section className="mt-8 overflow-hidden rounded-3xl border border-orange-400 bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-6 text-white sm:p-8">
    <div className="grid items-center gap-6 sm:grid-cols-[1fr_240px]">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">Limited Halloween exclusive</p>
        <h2 className="mt-2 text-3xl font-black">A little fright. A fresh look.</h2>
        <p className="mt-3 text-sm text-purple-100">Open 3 different random Halloween art styles from this exclusive collection of 10, including Devil Sprite. Every style has the same chance of appearing.</p>
        <p className="mt-2 text-sm text-purple-200">Cosmetics only, for cards and Sprites you own or collect later. Repeats can appear in later packs. Your styles stay unlocked permanently.</p>
        <p className="mt-4 font-bold text-orange-300">Available through 7 November 2026 · 23:59 UTC</p>
        <div className="mt-5 flex flex-wrap items-center gap-4"><span className="text-2xl font-black text-amber-300">🪙 {HALLOWEEN_PACK_COST} Coins</span>
          {!available ? <span className="rounded-full border border-orange-400 px-5 py-2 text-sm font-bold text-orange-200">Sale ended</span> : !signedIn ? <Link href="/login" className="rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-slate-950">Sign in to open</Link> : <button type="button" onClick={buy} disabled={pending || !!reveal || balance < HALLOWEEN_PACK_COST} className="rounded-full bg-orange-500 px-5 py-3 text-sm font-extrabold text-slate-950 hover:bg-orange-400 disabled:opacity-50">{pending ? "Opening…" : balance < HALLOWEEN_PACK_COST ? "Not enough Coins" : "Open Halloween pack"}</button>}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-orange-200">{error}</p>}
      </div>
      <div className="relative mx-auto flex h-72 w-56 items-center justify-center" aria-hidden="true">
        <Image src={HALLOWEEN_STYLES[0].image} alt="" width={165} height={231} className="absolute -translate-x-10 -rotate-12 rounded-xl shadow-2xl" />
        <Image src={HALLOWEEN_STYLES[8].image} alt="" width={165} height={231} className="absolute translate-x-10 rotate-12 rounded-xl shadow-2xl" />
        <Image src={HALLOWEEN_STYLES[9].image} alt="" width={165} height={231} className="absolute translate-y-4 rounded-xl shadow-2xl" />
      </div>
    </div>
    <details className="mt-6 border-t border-purple-700 pt-4"><summary className="cursor-pointer text-sm font-bold text-orange-200">See all 10 Halloween styles</summary>
      <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">{HALLOWEEN_STYLES.map(style => <li key={style.key}><Image src={style.image} alt={`${style.cardName} Halloween style`} width={212} height={297} className="w-full rounded-xl" /><p className="mt-2 text-xs font-bold">{style.cardName}</p></li>)}</ul>
    </details>
    {reveal && <PackRevealModal setName="Halloween" cards={reveal.cards} sprite={null} artStyles onClose={() => { setReveal(null); router.refresh(); }} />}
  </section>;
}
