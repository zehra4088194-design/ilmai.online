import { LegalPage, type LegalBlock } from '@/components/legal/LegalPage';
export const dynamic='force-dynamic';
export const metadata={title:'Acceptable Use Policy | Ilm AI',description:'Rules for safe, lawful and responsible use of Ilm AI.'};
const blocks:LegalBlock[]=[
{heading:'Use the service lawfully',paragraphs:[
'Use Ilm AI only for lawful purposes and in compliance with these Terms, applicable law, third-party terms and the rights of other people. You are responsible for the prompts, files, outputs and actions associated with your account.'
]},
{heading:'Prohibited activity',bullets:[
'Do not use the service to threaten, harass, exploit, impersonate, stalk or harm people, or to encourage violence or self-harm.',
'Do not create, request or distribute child sexual abuse material, non-consensual intimate imagery or other exploitative content.',
'Do not use the service to commit fraud, phishing, scams, identity theft, payment abuse, spam or unauthorised access.',
'Do not request malware, credential theft, ransomware, destructive code, unauthorised surveillance or instructions intended to compromise systems or networks.',
'Do not violate copyright, trademark, privacy, confidentiality, publicity or other intellectual-property or personal rights.',
'Do not upload sensitive personal information about another person unless you have a lawful basis and the necessary authority to do so.',
'Do not bypass safety controls, usage limits, credit accounting, access restrictions or payment verification.',
'Do not reverse engineer, disrupt, overload, scrape or attempt to extract source code, data or model access beyond the interfaces and permissions provided.'
]},
{heading:'AI output and publication',paragraphs:[
'Review generated content before relying on it or sharing it. Do not present AI-generated material as verified professional advice, a real person’s statement or an authentic source when it is not. You are responsible for checking accuracy, permissions and the possible impact of content you publish.'
]},
{heading:'Uploads, privacy and education',paragraphs:[
'Only upload material you own, are authorised to use or are otherwise lawfully permitted to provide. Do not upload school records, medical records, passwords, identity documents, confidential employer information or other sensitive material unless the feature is appropriate and you have authority to submit it.'
]},
{heading:'Enforcement and reports',paragraphs:[
'We may investigate credible reports, restrict a feature, suspend an account or remove access to content where reasonably necessary to protect the service, users, providers or the public, or to comply with law. We aim to take proportionate action and provide a support contact where it is safe and lawful to do so.',
'To report suspected misuse, provide the relevant account or conversation details through the support contact listed above. Do not send illegal content as an attachment to a report.'
]},
{heading:'Updates',paragraphs:[
'This policy may be updated as new tools and risks emerge. Continued use of Ilm AI is subject to the current version.'
]}
];
export default function Page(){return <LegalPage title="Acceptable Use Policy" description="Use Ilm AI responsibly. These rules protect users, creators, schools, providers and the service." blocks={blocks}/>;}
