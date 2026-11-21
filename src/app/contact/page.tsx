import { LegalPage, type LegalBlock } from '@/components/legal/LegalPage';
export const dynamic='force-dynamic';
export const metadata={title:'Contact & Support | Ilm AI',description:'Contact Ilm AI for account, billing, privacy and service support.'};
const blocks:LegalBlock[]=[
{heading:'General support',paragraphs:[
'For account access, broken features, product questions and technical problems, email contact@ilmai.online. Include the account email, the page or feature affected, the approximate time and a brief description so we can understand what happened. Never include your password, one-time codes, wallet PIN or full payment-card details.'
]},
{heading:'Feedback and suggestions',paragraphs:[
'For product feedback, feature requests, suggestions or ideas, email feedback@ilmai.online. Please do not include passwords, one-time codes or confidential payment information.'
]},
{heading:'Billing and payment support',paragraphs:[
'For Paddle, PayPro, JazzCash or Easypaisa payment questions, include your Ilm AI payment ID or provider transaction reference, plan name, payment date and amount. If a wallet request is still pending, check its status in your account before sending a second payment.',
'For refund or cancellation requests, see the Refunds & Cancellation Policy. Payments are verified against provider records before credits or plan access are changed.'
]},
{heading:'Privacy requests',paragraphs:[
'For requests to access, correct or delete personal information, or to ask how content is processed, email contact@ilmai.online. We may ask you to verify account ownership before sharing account-specific information or making changes.'
]},
{heading:'Report a security or abuse issue',paragraphs:[
'Please report suspected account compromise, exposed credentials, security vulnerabilities or misuse to contact@ilmai.online. Share enough technical detail to help us investigate, but do not publish exploit details or send other users’ private information.'
]},
{heading:'What to include in a message',paragraphs:[
'For the fastest response, write from the email address connected to your Ilm AI account and describe the issue in a few clear sentences. For billing questions, include the payment date, plan and transaction reference. For product suggestions, tell us what you were trying to do and what would make the experience better. Please keep passwords, sign-in codes and sensitive personal information out of your message.'
]}
];
export default function Page(){return <LegalPage title="Contact & Support" description="Get help with your Ilm AI account, payments, privacy requests or a service issue." blocks={blocks}/>;}
