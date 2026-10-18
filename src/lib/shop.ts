import { prisma } from "./prisma";
import { getStripe, getStripeAppOrigin, getStripeMode, getStripeWebhookSecret } from "./stripe";
import { getShopProduct, ShopSelectionError } from "./shop-products";
import { generateShinyPackFromPool } from "./shiny-packs";
import { creditCoins } from "./coins";

const PURPOSE = "ns-tcg-shop";

export async function createShopCheckout(userId: string, productId: string, requestedSet: string): Promise<string> {
  const product = getShopProduct(productId);
  const mode = getStripeMode();
  if (mode === "live") getStripeWebhookSecret();
  const stripe = getStripe();
  const origin = getStripeAppOrigin();
  let setName: string | null = null;
  if (product.packs) {
    if (!requestedSet || requestedSet.length > 200) throw new ShopSelectionError("Choose a set for your packs.");
    const pool = await prisma.card.findMany({ where: { set: requestedSet },
      select: { id: true, name: true, image: true, rarity: true, type: true } });
    if (!pool.length) throw new ShopSelectionError("That card set is not available.");
    if (product.packKind === "SHINY") {
      try { generateShinyPackFromPool(pool); }
      catch { throw new ShopSelectionError("That set needs Mythic, Epic, Legendary and Common/Rare cards before shiny packs can be bought."); }
    }
    setName = requestedSet;
  }
  // Snapshot the exact entitlement before contacting Stripe. Future price
  // changes cannot alter an already-created checkout's purchased rewards.
  const purchase = await prisma.shopPurchase.create({ data: {
    userId, productId: product.id, productName: product.name, amountPence: product.pricePence,
    coins: product.coins, packs: product.packs, packKind: product.packKind, setName,
  } });
  const session = await stripe.checkout.sessions.create({
    mode: "payment", managed_payments: { enabled: false },
    client_reference_id: userId, metadata: { purpose: PURPOSE, purchaseId: purchase.id },
    line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: product.pricePence,
      product_data: { name: product.name, ...(setName ? { description: `${setName} · ${product.packKind === "SHINY" ? "15" : "10"} cards per pack` } : {}) },
    } }],
    success_url: `${origin}/store/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/store/bundles?cancelled=1`,
  }, { idempotencyKey: `shop-${purchase.id}` });
  if (session.livemode !== (mode === "live") || !session.url) throw new Error("Could not create checkout in the configured payment mode.");
  await prisma.shopPurchase.update({ where: { id: purchase.id }, data: { stripeSessionId: session.id } });
  return session.url;
}

// Both the signed webhook and the logged-in return page call this. Stripe
// is always queried directly; query parameters never prove payment.
export async function fulfillShopCheckout(sessionId: string, expectedUserId?: string) {
  const mode = getStripeMode();
  if (!new RegExp(`^cs_${mode}_[A-Za-z0-9_]+$`).test(sessionId) || sessionId.length > 255) throw new Error("Invalid checkout session.");
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
  if (session.metadata?.purpose !== PURPOSE) return null;
  // Recover if Stripe created the session but a network/process failure
  // interrupted saving its ID locally. Its server-written metadata identifies
  // the original snapshot; the transaction below binds the ID when paid.
  const purchase = await prisma.shopPurchase.findUnique({ where: { stripeSessionId: sessionId } })
    ?? (session.metadata.purchaseId ? await prisma.shopPurchase.findUnique({ where: { id: session.metadata.purchaseId } }) : null);
  if (!purchase || (expectedUserId && purchase.userId !== expectedUserId)) throw new Error("Purchase not found.");
  const items = session.line_items?.data;
  if ((purchase.stripeSessionId && purchase.stripeSessionId !== sessionId) ||
      session.livemode !== (mode === "live") || session.mode !== "payment" || session.client_reference_id !== purchase.userId ||
      session.metadata.purchaseId !== purchase.id || session.currency !== "gbp" || session.amount_total !== purchase.amountPence ||
      items?.length !== 1 || items[0].quantity !== 1 || items[0].amount_total !== purchase.amountPence) {
    throw new Error("Checkout does not match this purchase.");
  }
  if (session.status !== "complete" || session.payment_status !== "paid") return { ...purchase, fulfilled: false };
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.shopPurchase.updateMany({
      where: { id: purchase.id, fulfilledAt: null, OR: [{ stripeSessionId: null }, { stripeSessionId: sessionId }] },
      data: { fulfilledAt: new Date(), stripeSessionId: sessionId },
    });
    if (!claimed.count) return;
    if (purchase.coins) await creditCoins(tx, purchase.userId, purchase.coins, "STRIPE_PURCHASE", {
      purchaseId: purchase.id, stripeSessionId: session.id, productId: purchase.productId,
    });
    if (purchase.packs) {
      if (!purchase.setName) throw new Error("Pack purchase is missing its card set.");
      await tx.earnedPack.createMany({ data: Array.from({ length: purchase.packs }, (_, number) => ({
        userId: purchase.userId, purchaseId: purchase.id, number, setName: purchase.setName!, packKind: purchase.packKind,
      })) });
    }
  });
  return { ...purchase, fulfilled: true };
}
