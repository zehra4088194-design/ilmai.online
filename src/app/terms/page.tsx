import { LegalPage, type LegalBlock } from '@/components/legal/LegalPage';
export const dynamic='force-dynamic';
export const metadata={title:'Terms of Service | Ilm AI',description:'Terms for using the Ilm AI workspace and paid plans.'};
const blocks:LegalBlock[]=[
{heading:'Acceptance and service operator',paragraphs:[
'These Terms apply to your access to ilmai.online and the Ilm AI services, including chat, model comparison, file and library features, educational tools, image/video or document generation, website building, credits and paid plans. By creating an account or using the service, you agree to these Terms and the Privacy Policy.',
'These Terms explain the basic rules for using Ilm AI, protecting your account, submitting content and purchasing access to paid features. Please also read the Privacy Policy, Refunds & Cancellation Policy and Acceptable Use Policy so you understand how the service works.'
]},
{heading:'Accounts and eligibility',bullets:[
'Provide accurate account information, keep your sign-in credentials confidential and promptly tell us if you suspect unauthorised access.',
'You are responsible for activity carried out through your account, subject to applicable law.',
'Do not create accounts or use paid services if you are legally unable to accept these Terms. Users who are minors should use the service only with appropriate parent, guardian or institutional permission and supervision.'
]},
{heading:'AI outputs and limitations',paragraphs:[
'AI systems can produce inaccurate, incomplete, biased, outdated or inappropriate output. You must independently review important information and must not treat generated content as legal, medical, financial, educational assessment or other professional advice. Verify facts, citations, calculations and generated files before relying on them.',
'You are responsible for deciding whether an AI output is suitable for your purpose, checking third-party rights and reviewing any content before you publish, submit, distribute or act on it. We do not guarantee that a model will always be available or that generated results will be unique or error-free.'
]},
{heading:'Your content and permissions',paragraphs:[
'You retain rights you already hold in the prompts, files and other material you submit. You grant Ilm AI and the service providers used to deliver the requested feature a limited permission to host, transmit, process, reproduce and display that material as necessary to provide, secure and support the service.',
'You confirm that you have the rights and permissions needed to submit the material and request its processing. Do not upload material that violates another person’s privacy, confidentiality, intellectual-property rights or other legal rights.'
]},
{heading:'Plans, credits, prices and taxes',paragraphs:[
'Current plan names, features, prices, currencies, billing periods and AI credit allocations are displayed on the Pricing page and are controlled by the operator through the Admin plan catalogue. The price and included credits shown at the time you place an order form the basis of that purchase. Promotions and discount codes apply only when shown as accepted at checkout.',
'Credits are service units used to access supported features. They are not money, stored value, transferable property or a promise of a fixed number of model tokens. Actual consumption can vary by model, request size, tool and generation type. Credits may be limited to the plan period and can expire when that period ends, as described on the Pricing page and in your account.',
'The final amount charged may include taxes or other amounts calculated by the payment provider at checkout. Review the provider’s final checkout total before confirming payment. Ilm AI may change future plan prices or features; any change will be displayed before a new purchase or renewal where required.'
]},
{heading:'Payment providers and subscriptions',paragraphs:[
'Paddle is used for eligible international checkout plans where configured. Paddle checkout, taxes, payment instruments, invoices and subscription payment processing are subject to Paddle’s own terms and policies. The plan catalogue may use recurring Paddle price IDs or one-time prices; the billing period and renewal details shown at checkout control the provider transaction.',
'PayPro may be offered for eligible PKR plans using supported JazzCash or Easypaisa wallet flows. You must approve a payment request through your own wallet. In the current Ilm AI integration, PayPro purchases are term-based and are not automatically charged again by Ilm AI; you need to make a new payment to extend access.',
'Your plan or credits are activated only after the payment provider’s signed notification or verified status response confirms payment. A checkout page, wallet prompt or initial “processing” response is not proof that payment succeeded.'
]},
{heading:'Cancellations, refunds and disputes',paragraphs:[
'Where an automatically renewing Paddle subscription is configured, cancellation options are shown in the account billing area and may take effect at the end of the current billing period. Any accrued charges and access during the paid period remain subject to the checkout and provider terms. PayPro term purchases do not auto-renew through this integration.',
'Refund eligibility, partial payments, chargebacks and disputes are handled under the Refunds & Cancellation Policy, applicable law and the payment provider’s rules. Contact support with your payment reference if you believe a payment was taken incorrectly.'
]},
{heading:'Acceptable use and suspension',paragraphs:[
'You must follow the Acceptable Use Policy. We may restrict or suspend access to protect users, providers, the service or the public; to address suspected fraud, abuse or legal violations; or where a provider requires action. Where reasonably possible, we will explain a restriction and provide a route to contact support.'
]},
{heading:'Third-party services and availability',paragraphs:[
'AI models, payment providers, email, file storage and infrastructure services are provided by third parties and may have their own terms. Features may be changed, limited or temporarily unavailable. We may update the service for security, reliability, legal or product reasons.'
]},
{heading:'Service availability and legal rights',paragraphs:[
'We work to keep Ilm AI useful and available, but access may occasionally be interrupted by maintenance, provider outages, security updates or technical issues. AI outputs can also contain mistakes and should be reviewed before you rely on them. To the extent permitted by applicable law, Ilm AI is provided on an “as available” basis. Nothing in these Terms limits any consumer protection or other right that cannot lawfully be excluded.'
]},
{heading:'Changes and contact',paragraphs:[
'We may revise these Terms as Ilm AI adds features, updates its providers or responds to changes in applicable requirements. The latest version will appear on this page with its updated date. For questions about these Terms, email contact@ilmai.online.'
]}
];
export default function Page(){return <LegalPage title="Terms of Service" description="Please read these terms before creating an account, using AI features or purchasing credits and plans." blocks={blocks}/>;}
