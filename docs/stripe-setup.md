# Stripe setup

The Stripe Node SDK, server configuration helpers and webhook signature
verification are installed. An admin-only simulated £1 Checkout is available
at `/store/stripe-test`, linked from the Pack Store. It only accepts test-mode
keys and grants no Coins, cards or packs. The Store at `/store` (`/store/bundles` redirects here)
supports the configured GBP prices. Test keys allow admin sandbox purchases;
live keys enable real purchases for logged-in customers once the webhook signing
secret is configured. The demo checkout is disabled before any API call in live mode.
Purchased Coins are credited to the wallet and packs are saved to open later.
The signed webhook is `/api/stripe/webhook`.

## Try checkout

After deployment, sign in with an admin account and open
`https://ns-tcg1.onrender.com/store/stripe-test`. Click **Try £1 test checkout**.
Use `4242 4242 4242 4242`, any future expiry, any three-digit CVC and any postal
code. This demonstration disables Managed Payments for its session, overriding
the account default, because no product is being sold or classified for tax.
The return page retrieves the session from Stripe and checks its owner,
purpose, amount and payment status before showing success. Cancelling returns
to the same page. No webhook signing secret is needed for this demonstration.

## Configure credentials

1. Rotate the test secret key shared in chat in the Stripe Dashboard's API keys
   settings. Keep the replacement in a secrets store, not chat or Git.
2. In Render, open the NS TCG service's Environment settings and set
   `STRIPE_SECRET_KEY` to the replacement test key. For local development use
   the ignored `.env` file. Use test keys while testing.
3. Set `APP_URL=https://ns-tcg1.onrender.com`, or use Render's automatically
   provided `RENDER_EXTERNAL_URL`. Locally use `http://localhost:3000`.
4. In Stripe Workbench (in the same sandbox as your key), create a webhook
   destination for `https://ns-tcg1.onrender.com/api/stripe/webhook`.
   Select `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
   Set its signing secret as `STRIPE_WEBHOOK_SECRET` in Render, then save and deploy.
   Choose Snapshot payloads, events from Your account, and API version
   `2026-09-30.endive`. This is a separate `whsec_…` value, not the Stripe API key. It ensures purchases
   are delivered even when a customer closes the browser before returning.

Hosted Checkout redirects to Stripe's payment page and does not require a
publishable key or Stripe.js in this app.

## Products

Prices are defined on the server in `src/lib/shop-products.ts`.

| Digital bundle | GBP |
| --- | ---: |
| 6 normal packs | £1.00 |
| 12 normal packs | £1.75 |
| 24 normal packs | £3.25 |
| 6 shiny packs | £2.00 |
| 5,000 Coins | £1.00 |
| 10,000 Coins | £2.00 |
| 20,000 Coins | £3.75 |
| 50,000 Coins | £6.00 |

Each shiny pack contains 15 cards: 2 Mythics, 2 Epics, 1 Legendary and 10
random Commons/Rares. Missing guaranteed rarities cause a set to be rejected
before checkout. Both normal and shiny packs have a 10% bonus Sprite chance.
The source card data stays unchanged.
Single normal packs can also be opened in the Store for 1,000 Coins and shiny
packs for 2,000 Coins. Their cards and any bonus Sprite are granted immediately.

Physical preorder information is available at `/store/physical`, based on
the former preorder catalog: Basic Pack £0.50, Shiny Pack £1.00, minimum order
£1.50. Sales and reservation actions remain disabled. Shipping and actual
physical checkout must be configured before enabling these products.

## Test purchases

Sign in as admin, choose a bundle and set at `/store`, then use a test
card. Returning to the site retrieves the paid session from Stripe and grants
the snapshotted purchase. Repeated return visits and duplicate webhooks cannot
   duplicate rewards. Packs can then be opened at `/store/packs`.

Test a second purchase while closing the browser before returning, and verify
that its webhook still grants the purchase.

## Enable live purchases

Complete Stripe account activation, then create the same webhook destination
in live mode. In Render, set `STRIPE_SECRET_KEY` to the live secret/restricted
key and `STRIPE_WEBHOOK_SECRET` to that LIVE endpoint's signing secret. Keep
`APP_URL=https://ns-tcg1.onrender.com`, then save, rebuild and deploy.

The key prefix selects the mode automatically; no extra mode variable is needed.
The public Buy bundle buttons only become available with a live key, a configured
signing secret and a valid app URL. A missing signing secret blocks creation of
live checkouts. Webhooks and Checkout Sessions must match the configured mode.
Returning with a paid live session grants the same snapshotted rewards once.
The test demo redirects to the bundle store in live mode and cannot create a charge.
Physical sales and reservations remain disabled.

Verify the deployed store displays Buy bundle (not Test purchase), and check
payment delivery in Stripe's live webhook logs. Live payments require real
payment details; the automated checks use mocked live sessions and do not charge cards.

## Integration requirements

- Require login to bind each Checkout Session to the correct player.
- Keep product IDs, amounts and rewards on the server. Accept only a product
  identifier from the client, never a client-supplied price or Coin amount.
- Create one-time hosted Checkout Sessions with trusted success/cancel URLs.
- Verify webhook signatures against the unchanged request body using
  `verifyStripeWebhook` from `src/lib/stripe.ts`.
- Handle `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
  Verify the session's paid status and the purchased product before granting it.
- Atomically record fulfillment keyed by the unique Checkout Session ID and
  grant the purchase in the same database transaction. Retries must not grant twice.
- Display the payment state on the return page; never treat a success redirect
  alone as proof of payment.
- Test successful, declined, delayed and duplicate payment notifications before
  enabling checkout. Test card: `4242 4242 4242 4242`, a future expiry, any CVC.

## References

- [Stripe-hosted Checkout](https://docs.stripe.com/checkout/quickstart)
- [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted)
- [Webhook verification](https://docs.stripe.com/webhooks)
- [API key management](https://docs.stripe.com/keys)
