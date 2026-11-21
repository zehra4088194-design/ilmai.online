import { LegalPage, type LegalBlock } from '@/components/legal/LegalPage';
export const dynamic='force-dynamic';
export const metadata={title:'Cookies & Browser Storage | Ilm AI',description:'How Ilm AI uses essential cookies and browser storage.'};
const blocks:LegalBlock[]=[
{heading:'What this page covers',paragraphs:[
'This notice describes cookies and similar technologies used by Ilm AI and by external providers when you use the website, sign in or open a payment checkout. A cookie is a small value stored by a browser. Similar technologies include local storage and session storage.'
]},
{heading:'Essential authentication and security',paragraphs:[
'Authentication and session cookies are used to keep you signed in, protect account routes and maintain security. These are necessary for the requested account service and cannot be turned off in the app while continuing to use sign-in features.'
]},
{heading:'Application preferences',paragraphs:[
'Ilm AI stores appearance preferences in browser local storage under the key “ilm-appearance”. This allows your selected theme, accent colour, font and related display settings to persist between visits. This browser storage is not used as an advertising cookie.'
]},
{heading:'Payment provider technologies',paragraphs:[
'When you continue to Paddle or PayPro checkout, the payment provider may use cookies, scripts or similar technologies to load its payment page, protect payment sessions, prevent fraud and complete the transaction. The provider’s own cookie and privacy notices govern its hosted pages and payment components.'
]},
{heading:'Analytics and advertising',paragraphs:[
'This notice does not promise that every third-party provider or future feature will use no analytics or measurement technologies. If optional analytics, marketing tags or advertising pixels are added, this notice and any required consent controls must be updated before those technologies are enabled.'
]},
{heading:'Managing browser storage',paragraphs:[
'You can clear cookies and local storage through your browser settings. Clearing essential authentication cookies may sign you out; clearing local storage may reset your appearance preferences. Browser controls differ by browser and device.'
]},
{heading:'Changes and contact',paragraphs:[
'We may update this notice if we add or remove technologies or providers. For questions about cookies or browser storage, contact the support email listed at the top of this page.'
]}
];
export default function Page(){return <LegalPage title="Cookies & Browser Storage Notice" description="This notice explains the essential cookies and browser storage that help Ilm AI work." blocks={blocks}/>;}
