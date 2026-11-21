# Ilm AI — Billing and legal launch setup

This document covers the operator steps required before enabling paid plans. The application code does not contain payment credentials. Put secret values in Coolify runtime environment variables and public Paddle.js values in Coolify build variables.

## 1. Configure the plan catalogue

Open `/admin/billing` with an administrator account.

For each paid plan, set:

- Display name, description, currency and price amount.
- AI credits granted after a successful payment.
- Plan period in days.
- Features and display order.
- The Paddle Price ID for a USD plan, or enable PayPro for a PKR plan.

A paid plan can only be activated when its price and credit amount are positive and at least one matching provider is configured. PayPro requires an integer PKR price of at least PKR 100.

The public `/pricing` page and signed-in `/plans` screen both read values from `public.billing_plans`; the application does not hard-code paid prices or credit allocations. Keep the Paddle catalogue price in sync with the plan price in Admin. The checkout handler checks the Paddle price status, currency, amount and recurring interval.

## 2. Paddle setup

Paddle is the international checkout route for plans configured in USD.

1. Create the product and price in Paddle. Copy the `pri_...` Price ID. Use the correct currency and amount from your intended Admin plan.
2. Create an API key with the permissions required to read prices and discounts and create transactions (including `price.read`, `discount.read` where discounts are used, and `transaction.write`).
3. Create a Paddle client-side token for Paddle.js. This token is intended for the browser; never expose the Paddle API key or webhook secret.
4. In Paddle Website approval, add and obtain approval for your production domain.
5. Set the Paddle default payment link to `https://ilmai.online/checkout`. The page loads Paddle.js and initializes checkout for the `_ptxn` parameter returned by Paddle. Sandbox and live accounts have separate checkout configuration; use the matching environment and token in each deployment.
6. Configure a Paddle notification destination at `https://ilmai.online/api/webhooks/paddle`. Subscribe to at least `transaction.completed` and the subscription lifecycle events your account offers (created, updated, canceled). Copy the notification destination secret into Coolify.
7. In Admin, set the plan currency to USD, its exact Paddle Price ID and activate it.

Coolify variables:

- Runtime secrets: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENVIRONMENT` (`sandbox` or `production`).
- Build variables: `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENVIRONMENT` (must match the server environment).

Paddle automatically calculates its final checkout total, including any taxes or discounts. The signed completed-transaction notification is verified before Ilm AI grants credits. The recorded payment amount reflects the provider-confirmed total. Do not change a Paddle Price ID for an existing recurring subscription without planning the migration; existing subscriptions keep the historic price ID recorded at checkout.

## 3. PayPro / JazzCash / Easypaisa setup

PayPro is the PKR wallet route in this integration.

1. Obtain the merchant number, application secret and the exact API base URL from PayPro onboarding/support. Do not guess the API base URL.
2. Configure the notification callback in PayPro as `https://ilmai.online/api/webhooks/paypro`.
3. Put `PAYPRO_MERCHANT_NO`, `PAYPRO_APP_SECRET`, `PAYPRO_API_BASE_URL` and `PAYPRO_NOTIFY_URL` in Coolify runtime environment variables.
4. In Admin, set the plan currency to PKR, enable PayPro for that plan and activate it. The amount must be a whole number and at least PKR 100.
5. PayPro's Pakistan collection API expects a whole-rupee amount of at least PKR 100 and a Pakistani mobile number in `03XXXXXXXXX` or `3XXXXXXXXX` format. Its documentation recommends using a Gmail address for the payer email. Test both JazzCash and Easypaisa with a PayPro test/merchant-approved wallet before taking live payments.
6. PayPro's onboarding documentation notes that test API IP allowlisting may be required. Give PayPro the app server's outbound IP and have them confirm it is allowlisted before running sandbox tests.

The PayPro wallet request may initially return a processing status. Ilm AI does not grant credits until the signed callback or an authenticated status query confirms a successful transaction. The current integration treats PayPro purchases as fixed-term payments; it does not automatically debit a wallet again at renewal.

## 4. Discount codes

Create discounts under Admin → Plans & discounts. For Paddle discounts, enter the corresponding Paddle Discount ID and ensure the provider discount type, value and currency match the Ilm AI discount record. A fixed discount must use the same currency as the plan.

## 5. Legal and support details

Complete the following Coolify runtime variables before opening registration and paid checkout to the public:

- `LEGAL_ENTITY_NAME`: the actual legal person or business operating the service.
- `LEGAL_POSTAL_ADDRESS`: a valid postal/contact address for the operator.
- `SUPPORT_EMAIL=contact@ilmai.online`: monitored general support and billing address.
- `FEEDBACK_EMAIL=feedback@ilmai.online`: monitored product feedback and suggestions address.
- `PRIVACY_CONTACT_EMAIL=contact@ilmai.online`: privacy requests (can use the same monitored contact inbox).
- `LEGAL_GOVERNING_LAW`: the governing law/jurisdiction selected by the operator after legal review.
- `LEGAL_DATA_REGIONS`: actual countries/regions used by the Supabase project, Backblaze B2 bucket, email, AI/model, payment and infrastructure providers for this deployment.

Configure `ADMIN_EMAILS=ilmai.store2@gmail.com` to recognise the owner account as an administrator. For transactional mail, set `EMAIL_FROM=Ilm AI <contact@ilmai.online>` and verify the `ilmai.online` domain and sender in Resend before enabling receipts. Create the `contact@ilmai.online` and `feedback@ilmai.online` mailboxes or forwarding aliases, and make sure someone monitors them.

The public policies are available at:

- `/privacy`
- `/terms`
- `/refunds`
- `/cookies`
- `/acceptable-use`
- `/contact`

These policy drafts reflect the current application architecture. They are not a substitute for advice from a lawyer familiar with the operator's business and the countries where its customers are located. Confirm the data regions and legal operator information before launch; do not leave the legal configuration fields blank.

## 6. Pre-launch test checklist

- Deploy the application with the correct public build variables and private runtime secrets.
- Verify `/checkout` loads Paddle.js and automatically opens a Paddle sandbox transaction from the `_ptxn` query parameter.
- Complete a Paddle sandbox payment. Confirm the signed webhook is accepted, the payment row becomes paid, the subscription period is correct, and credits are granted once only.
- Test Paddle cancellation and a recurring renewal if recurring prices are used.
- Complete PayPro test payments for JazzCash and Easypaisa. Confirm pending state is not treated as success, and verify the callback and status-query paths.
- Repeat a webhook delivery and confirm that the user does not receive duplicate credits.
- Test a failed/declined payment and a payment with an incorrect amount or reference.
- Confirm all policy pages, support/ privacy emails and data-region disclosures contain real operator information.
- Review the final pricing, tax display, renewal behaviour and refund/cancellation process before switching providers from sandbox to production.

No live payment has been run by this repository change. Live readiness depends on the operator's approved provider accounts, credentials, domain approval, product/price IDs, webhook setup and an end-to-end sandbox test.
