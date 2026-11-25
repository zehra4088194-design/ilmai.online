import { LegalPage, type LegalBlock } from '@/components/legal/LegalPage';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Refund & Cancellation Policy | Ilm AI',
  description: 'How refunds, cancellations and payment issues are handled for Ilm AI plans and credits.',
};

const blocks: LegalBlock[] = [
  { heading: 'Scope and payment providers', paragraphs: [
    'This policy applies to paid Ilm AI plans, subscriptions and credit purchases made through ilmai.online. The payment route used for an order matters: Paddle handles Paddle checkout transactions, while PayPro is used for eligible JazzCash and Easypaisa payments.',
    'Refund eligibility is always subject to applicable mandatory consumer-protection laws. Nothing on this page removes a right that cannot lawfully be waived.',
  ]},
  { heading: 'Paddle purchases and Merchant of Record', paragraphs: [
    'For orders processed through Paddle, our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for those orders. Paddle provides payment support and handles refunds and returns for Paddle transactions.',
    'Paddle’s Buyer Terms and Refund Policy govern refund requests for Paddle transactions. Under Paddle’s published policy, transactions are generally non-refundable and non-exchangeable unless applicable law requires otherwise. Paddle may consider a discretionary refund request submitted within 14 days of the transaction date, but submitting a request within that period does not guarantee approval. Paddle may consider the product, the reason for the request, usage or consumption, and other relevant circumstances.',
    'Country-specific statutory withdrawal or refund rights may apply and take priority where they provide stronger or non-waivable protection. Paddle’s policy in force for the transaction and the buyer terms presented for that purchase explain the applicable rules.',
  ], links: [
    { label: 'Paddle Buyer Refund Policy', href: 'https://www.paddle.com/legal/refund-policy' },
    { label: 'Paddle Buyer Terms', href: 'https://www.paddle.com/legal/buyer-terms' },
  ]},
  { heading: 'How to request a Paddle refund', paragraphs: [
    'Use the support or refund link in your Paddle transaction receipt, visit the Paddle Buyer Support site and choose “Request refund”, or use the billing/support link shown in your Ilm AI account where available. Paddle uses its transaction records to check the order and refund eligibility.',
    'Include the email address used at checkout and your Paddle transaction or order reference. Briefly explain the reason for the request and include relevant details if the issue relates to access, a technical defect or a duplicate charge.',
  ], links: [
    { label: 'Open Paddle Buyer Support', href: 'https://paddle.net' },
    { label: 'Paddle refund help for buyers', href: 'https://www.paddle.com/help/manage/your-customers/how-do-i-issue-refunds' },
  ]},
  { heading: 'Technical problems and incorrect charges', paragraphs: [
    'If a paid Ilm AI feature is unavailable, a material technical problem prevents you from using what was purchased, or you believe you were charged incorrectly, contact us first at contact@ilmai.online. Include your account email, approximate purchase date, payment reference and a description of the problem. We will review the service or account issue and try to help resolve it.',
    'For a Paddle transaction, if the issue cannot be resolved or you want to make a formal refund request, submit the request to Paddle through the buyer-support route above. Paddle determines and processes refunds for its transactions, subject to its policy and applicable law.',
  ]},
  { heading: 'Subscription cancellation', paragraphs: [
    'Cancelling a subscription and requesting a refund are different actions. You can cancel an eligible Paddle subscription through the “Manage subscription” link in your Paddle confirmation email or through Paddle Buyer Support. Cancellation normally takes effect at the end of the current billing period and prevents future renewal charges; it does not automatically refund a payment that has already been made.',
    'Check the subscription status and next billing date in the Paddle customer portal after submitting a cancellation request. Any statutory cancellation or withdrawal right that applies to your transaction remains unaffected.',
  ], links: [
    { label: 'Paddle Buyer Support', href: 'https://paddle.net' },
    { label: 'Paddle Buyer Terms — cancellations and refunds', href: 'https://www.paddle.com/legal/buyer-terms' },
  ]},
  { heading: 'PayPro, JazzCash and Easypaisa payments', paragraphs: [
    'For a payment made through PayPro using JazzCash or Easypaisa, contact Ilm AI at contact@ilmai.online with your account email, PayPro trade or transaction reference, purchase date and reason for the request. We will check the payment status and the related plan or credits.',
    'PayPro payments are separate from Paddle transactions and are not covered by Paddle’s Buyer Refund Policy. Any refund or reversal for a PayPro payment is reviewed through the applicable payment channel, our transaction records and mandatory law. Do not send wallet PINs, passwords or one-time verification codes to support.',
  ]},
  { heading: 'Credits, digital access and refunded orders', paragraphs: [
    'AI credits are usage units for Ilm AI features; they are not cash, a bank balance or a transferable payment instrument. Credits may be used as soon as they are added to an account, and usage or consumption can be relevant when a payment provider assesses a discretionary refund request.',
    'If a payment provider approves a refund, the related plan, subscription or paid access may be ended or adjusted in line with the provider’s decision, the transaction and applicable law. A cancellation by itself does not convert unused credits into cash or automatically create a refund.',
  ]},
  { heading: 'Chargebacks and payment disputes', paragraphs: [
    'If you do not recognise a payment or believe there has been a billing error, contact the relevant payment provider and Ilm AI support before opening a bank or card dispute where possible. This can help identify the transaction and resolve an issue more quickly.',
    'This request-first process does not limit any right you have to dispute an unauthorised or incorrect charge with your bank, card issuer, payment provider or under applicable law.',
  ]},
  { heading: 'Contact and policy updates', paragraphs: [
    'For Ilm AI account, service or PayPro payment questions, email contact@ilmai.online. For a Paddle refund or subscription request, use Paddle Buyer Support or the links in your Paddle receipt. Please do not include full card numbers, security codes, wallet PINs or passwords in support messages.',
    'We may update this policy when our products, payment methods or legal requirements change. The version published at the time of your transaction, the relevant payment provider terms and applicable mandatory law govern that transaction.',
  ], links: [
    { label: 'Contact Ilm AI support', href: 'mailto:contact@ilmai.online' },
    { label: 'Paddle Buyer Support', href: 'https://paddle.net' },
  ]},
];

export default function RefundsPage() {
  return <LegalPage title="Refund & Cancellation Policy" description="Read how refund requests, subscription cancellations and payment issues are handled for Ilm AI plans and credits." blocks={blocks} />;
}
