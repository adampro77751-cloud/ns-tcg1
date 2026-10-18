# Stripe test-mode setup

The Stripe Node SDK, server configuration helpers and webhook signature
verification are installed. An admin-only simulated £1 Checkout is available
at `/store/stripe-test`, linked from the Pack Store. It only accepts test-mode
keys and grants no Coins, cards or packs. Real purchase fulfillment and a
webhook HTTP endpoint are not connected yet.

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
   the ignored `.env` file. The helper rejects live-mode keys.
3. Set `APP_URL=https://ns-tcg1.onrender.com`, or use Render's automatically
   provided `RENDER_EXTERNAL_URL`. Locally use `http://localhost:3000`.
4. Once the webhook route is implemented, create a test-mode webhook destination
   and set its signing secret as `STRIPE_WEBHOOK_SECRET`. This is a separate
   `whsec_…` value, not the Stripe API key. Do not register an endpoint yet.

Hosted Checkout redirects to Stripe's payment page and does not require a
publishable key or Stripe.js in this app.

## Choose products before connecting checkout

Confirm what is being sold (Coin bundles, physical packs, or both), the currency,
and each price. The current digital store exchanges Coins for packs; the old
physical preorder store is disabled. Physical purchases also need shipping
regions, shipping prices and a fulfillment workflow.

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
