import { LegalPage, type LegalBlock } from '@/components/legal/LegalPage';
export const dynamic='force-dynamic';
export const metadata={title:'Refunds & Cancellation | Ilm AI',description:'How Ilm AI handles payment issues, refunds and subscription cancellation.'};
const blocks:LegalBlock[]=[
{heading:'Scope',paragraphs:[
'This policy applies to paid Ilm AI plans, credits and purchases processed through Paddle or PayPro. It should be read with the Terms of Service and the payment provider’s own terms. Mandatory consumer rights in your location take precedence where they cannot lawfully be waived.'
]},
{heading:'Before you pay',bullets:[
'Review the selected plan, currency, price, billing period, AI credit allocation and included features on the Pricing page.',
'Review the final amount shown by Paddle or PayPro before approving payment. A provider may calculate taxes or other checkout amounts.',
'Do not approve a wallet request unless the merchant, amount and purchase details match the plan you selected.'
]},
{heading:'Refund requests',paragraphs:[
'If you believe you were charged incorrectly, paid more than once, selected the wrong plan, did not receive the purchased access or experienced a material service issue, email contact@ilmai.online as soon as possible. Include your Ilm AI account email, plan, approximate payment date, payment provider and transaction reference. Do not send your card number, card security code, wallet PIN or password.',
'Refunds are reviewed against the payment status, provider records, credits already granted or consumed, service access, the nature of the issue and applicable law. Where a refund is approved, it will normally be submitted through the original payment provider and returned using that provider’s available process. Processing times depend on the provider and payment method.',
'Unused credits or a period with no usage do not automatically guarantee a refund. This does not limit any refund or cancellation right that applicable consumer law gives you. Fraudulent, unauthorised or duplicate charges will be investigated with the relevant provider.'
]},
{heading:'Cancellation of Paddle subscriptions',paragraphs:[
'If a Paddle plan is recurring, you can use the billing area in your account to request cancellation at the end of the current billing period. The current billing period generally remains available until its end unless Paddle or applicable law requires otherwise. The cancellation state is confirmed by the provider and shown in the account.',
'Cancelling a subscription prevents future renewal charges where the cancellation is accepted; it does not automatically refund a payment already collected. To request a refund for an earlier charge, contact support and follow the provider’s dispute process where appropriate.'
]},
{heading:'PayPro, JazzCash and Easypaisa',paragraphs:[
'PayPro wallet payments in the current Ilm AI integration are term purchases and do not automatically renew. You must approve each new wallet payment to extend a plan. If a wallet request remains pending, check its status from your billing page before submitting another payment. A pending request is not a completed purchase.',
'If your wallet was debited but Ilm AI still shows a pending or failed payment, contact support with the PayPro merchant and platform transaction references. We will compare the provider notification and payment status before changing credits or access.'
]},
{heading:'Chargebacks and payment disputes',paragraphs:[
'Please contact support first when practical so we can review the payment and resolve a genuine service or billing issue. You may also contact your bank, card issuer or wallet provider in accordance with their dispute procedures. We may suspend access to a disputed purchase while the provider investigates, where permitted by law.'
]},
{heading:'Contact and legal rights',paragraphs:[
'Send refund and cancellation requests to contact@ilmai.online. Include the transaction reference and enough information for us to locate the payment; never send passwords, card security codes or wallet PINs. Nothing in this policy takes away mandatory consumer rights or a dispute resolution option available under applicable law.'
]}
];
export default function Page(){return <LegalPage title="Refunds & Cancellation Policy" description="Understand payment verification, wallet purchases, subscription cancellation and how to request a refund." blocks={blocks}/>;}
