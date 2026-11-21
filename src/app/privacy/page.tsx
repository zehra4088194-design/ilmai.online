import { LegalPage, type LegalBlock } from '@/components/legal/LegalPage';
export const dynamic='force-dynamic';
export const metadata={title:'Privacy Policy | Ilm AI',description:'How Ilm AI collects, uses, stores and shares personal information.'};

const blocks:LegalBlock[]=[
{heading:'Who this notice covers',paragraphs:[
'This notice applies when you visit ilmai.online, create an account, use chat and creative tools, upload files, purchase a plan, or contact support. It explains the categories of information involved and the service providers that help operate Ilm AI.',
'Ilm AI is an AI workspace. Information you submit to a model or tool may need to be sent to the selected AI or infrastructure provider to complete your request.'
]},
{heading:'Information we process',bullets:[
'Account and profile details such as email address, name, account identifiers, login/session information, preferences and profile settings.',
'Prompts, chat messages, conversation titles, uploaded files, generated outputs and content you choose to save in your library or projects.',
'Usage and service data such as model selection, token/credit usage, generation status, request time, response time, error logs and payment/credit history.',
'Billing records such as plan, currency, amount, payment status, provider transaction reference and the contact details required to reconcile a payment. Complete card numbers and card security codes are handled by the payment provider, not stored by Ilm AI.',
'Support communications, feedback and information you choose to include in a support request.'
]},
{heading:'How information is used',bullets:[
'To create and secure accounts, authenticate sessions and provide the features you request.',
'To route prompts and files to the AI model you choose, return results, save conversations and maintain your projects or library.',
'To calculate usage, apply credit balances, enforce plan limits, prevent fraud and abuse, and maintain payment and subscription records.',
'To send account, security, billing and service messages; to answer support requests; and to diagnose, maintain and improve reliability.',
'To comply with applicable legal obligations and respond to valid legal or security requests.'
]},
{heading:'AI models and other service providers',paragraphs:[
'When you submit content to an AI feature, the content needed to perform that request is sent to the selected model provider through the configured AI routing service. Depending on your selected model, that may include OpenRouter and the underlying model provider. Their own terms, privacy notices, retention settings and processing practices also apply. Review the provider information for the model you select before sending confidential information.',
'Ilm AI uses service providers for different operational purposes. These may include Supabase for authentication and database services, Backblaze B2 for file storage, Resend for transactional email, Paddle for international checkout and billing, PayPro for supported Pakistan wallet payments, and Cloudflare/E2B for infrastructure and isolated website-build processing. Providers receive only information needed for their service, subject to their respective roles and settings.',
'Payment providers process payment credentials and may collect billing, tax, identity or payment-method information directly. Ilm AI receives transaction and status information needed to grant credits, manage plan access, issue receipts and reconcile payments.'
]},
{heading:'Where information is stored and international transfers',paragraphs:[
'Information may be processed or stored in the countries and regions used by the cloud, AI, email, file-storage and payment providers configured for this deployment. The actual regions depend on the operator’s provider accounts, project settings and product configuration; they must not be assumed from the fact that the service is operated from Pakistan.',
'The operator must complete the “Data hosting regions” field above with the actual locations and provider arrangements before accepting production users. Some providers may process information outside your country. Where required, the operator should use appropriate contractual and technical safeguards for those transfers.'
]},
{heading:'Retention and deletion',paragraphs:[
'Account information, saved content, uploaded assets and usage records are retained while needed to provide the service, maintain security and support your account. Some billing, transaction, fraud-prevention and audit records may be retained for longer where required for accounting, dispute handling, legal compliance or legitimate security needs.',
'You may request access, correction or deletion of personal information by contacting the privacy email shown above. Account deletion may not immediately remove records that must be retained for legal, payment, security or backup purposes. The operator should describe any applicable retention period when responding to a request.'
]},
{heading:'Security',paragraphs:[
'Ilm AI uses access controls and technical safeguards intended to protect accounts, service credentials and stored information. No website, transmission or cloud service can be guaranteed completely secure. Use a strong unique password, keep account credentials private and avoid submitting passwords, payment-card details, sensitive identity numbers or confidential third-party information to AI prompts.'
]},
{heading:'Cookies and local browser storage',paragraphs:[
'Ilm AI uses essential browser storage needed for authentication, session continuity and application preferences. The app also stores appearance preferences in browser local storage. Paddle, PayPro or other external services may use their own cookies or similar technologies when you visit their checkout or hosted payment pages. See the Cookies page for more details.'
]},
{heading:'Children and education use',paragraphs:[
'Ilm AI may be used for educational purposes, but accounts should be created and managed by people who are legally able to accept the applicable terms. Where a child needs to use the service, a parent, guardian or responsible educational institution should review these terms and supervise the child’s use. Do not submit a student’s sensitive personal information unless you are authorised to do so.'
]},
{heading:'Your choices and privacy requests',bullets:[
'You can choose which AI model or tool to use and whether to submit a particular prompt or file.',
'You can avoid saving sensitive material in conversations and remove content where the product provides that control.',
'You may request access, correction, deletion or clarification by using the privacy contact shown above. Include the account email and enough detail to identify the request, but do not send passwords or full payment credentials.'
]},
{heading:'Changes and contact',paragraphs:[
'We may update this notice when the service, providers or legal requirements change. The latest version will be published at this URL with its updated date. For privacy questions, use the privacy contact listed at the top of this page.'
]}
];
export default function Page(){return <LegalPage title="Privacy Policy" description="This notice explains what information Ilm AI processes, why it is used, which service providers may receive it, and how to make a privacy request." blocks={blocks}/>;}
