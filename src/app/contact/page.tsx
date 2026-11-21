import { LegalPage, type LegalBlock } from '@/components/legal/LegalPage';
export const dynamic='force-dynamic';
export const metadata={title:'Contact & Support | Ilm AI',description:'Contact Ilm AI for account, billing, privacy and service support.'};
const blocks:LegalBlock[]=[
{heading:'General support',paragraphs:[
'For account access, broken features, product questions and technical problems, use the support email shown in the operator details above. Include the account email, page or feature affected, approximate time and a brief description. Do not include passwords, one-time codes or full payment credentials.'
]},
{heading:'Billing and payment support',paragraphs:[
'For Paddle, PayPro, JazzCash or Easypaisa payment questions, include your Ilm AI payment ID or provider transaction reference, plan name, payment date and amount. If a wallet request is still pending, check its status in your account before sending a second payment.',
'For refund or cancellation requests, see the Refunds & Cancellation Policy. Payments are verified against provider records before credits or plan access are changed.'
]},
{heading:'Privacy requests',paragraphs:[
'For requests to access, correct or delete personal information, or to ask how content is processed, use the privacy contact shown above. We may ask you to verify account ownership before sharing or changing account information.'
]},
{heading:'Report a security or abuse issue',paragraphs:[
'Please report suspected account compromise, exposed credentials, security vulnerabilities or misuse to the support contact shown above. Share enough technical detail to help us investigate, but do not publish exploit details or send other users’ private information.'
]},
{heading:'Before launch',paragraphs:[
'The operator must configure a monitored support email, privacy contact email, legal business name and postal address before accepting live customers. This page deliberately does not invent contact details.'
]}
];
export default function Page(){return <LegalPage title="Contact & Support" description="Get help with your Ilm AI account, payments, privacy requests or a service issue." blocks={blocks}/>;}
