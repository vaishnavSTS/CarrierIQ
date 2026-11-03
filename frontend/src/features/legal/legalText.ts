// Generated word for word from CarrierSafetyScan_Terms_of_Service.docx and
// CarrierSafetyScan_Privacy_Policy.docx. Edit those documents, regenerate this file, and change
// TERMS_VERSION in backend/app/schemas/auth.py so new sign-ups record the new version.

export interface LegalSection {
  heading: string
  paragraphs: string[]
  table?: { head: string[]; rows: string[][] }
}

export interface LegalDocument {
  title: string
  sections: LegalSection[]
}

export const TERMS_OF_SERVICE: LegalDocument = {
  title: 'CarrierSafetyScan Terms of Service',
  sections: [
    {
      heading: '1 Agreement and operator',
      paragraphs: [
        'These Terms of Service govern your use of CarrierSafetyScan, operated by Sky Transport Solutions (STS, we, or us). By affirmatively accepting these Terms when registering or purchasing a service, you agree to them. If you act for an organization, you represent that you have authority to bind it; you and your then bound organization are referred to as you. If you do not agree, do not create an account or use restricted services. Our Privacy Policy separately describes our information practices and does not waive statutory privacy rights.',
      ],
    },
    {
      heading: '2 Purpose and limits of the service',
      paragraphs: [
        'CarrierSafetyScan organizes public FMCSA and NHTSA carrier and vehicle information and provides compliance tracking, comparison, account and service request features. It may support DataQs case preparation and other STS services. It is a private commercial service, not a government website, and is not affiliated with, endorsed by or acting as FMCSA, NHTSA, USDOT or any other government agency. Subscription charges pay for our tools and services, not exclusive ownership of public government records.',
      ],
    },
    {
      heading: '3 Eligibility and account access',
      paragraphs: [
        'You must be at least 18 and authorized to act for the company or account represented. Provide accurate registration and company information and keep it current. We may verify USDOT, MC or National Producer Numbers and restrict access by role. Carrier access to linked records may require STS verification. Use individual credentials, protect them, and promptly report suspected compromise. You are responsible for use you authorize and for your own failure to safeguard access, subject to applicable law. Do not impersonate another company, claim another carrier’s records, share passwords to bypass seats or controls, or access records outside your permissions.',
      ],
    },
    {
      heading: '4 Public information and data quality',
      paragraphs: [
        'Public data may be incomplete, delayed, inaccurate, duplicated, corrected or unavailable. A carrier name, officer detail, VIN match, shared vehicle or other association does not by itself establish fraud, common ownership, noncompliance or unsafe operations. A crash or inspection entry is not a determination of fault. A missing event or favorable display does not certify compliance or safety. Source dates and update intervals may differ. Verify material facts directly with appropriate government sources and the carrier before relying on them. We do not promise real time updates, uninterrupted monitoring or notice of every regulatory event.',
      ],
    },
    {
      heading: '5 Your compliance and business decisions',
      paragraphs: [
        'You retain responsibility for regulatory filings, deadlines, carrier qualification, dispatch, coverage, underwriting and business decisions. Tracking information is informational and is not legal, insurance, tax or professional advice. Do not use a display as the sole basis for denying a load, coverage, employment or another material opportunity. Review source records, context and applicable procedures. Any filing or service performed by STS requires acceptance of the particular request and any separate scope and charges; a dashboard entry alone is not a filing or proof of government acceptance.',
      ],
    },
    {
      heading: '6 Individual eligibility and regulated uses',
      paragraphs: [
        'The service is offered for commercial motor carrier compliance review. You may not use it to make decisions about an individual’s employment, credit, housing, personal insurance or other eligibility governed by the Fair Credit Reporting Act or comparable laws unless a separate written agreement expressly authorizes that use and all legally required procedures are in place. This includes decisions concerning sole proprietors when the law treats them as consumers. A label in these Terms does not determine whether a report or activity is regulated. Do not use the service to circumvent consumer reporting, insurance, privacy, anti discrimination or adverse action obligations.',
      ],
    },
    {
      heading: '7 Permitted use and restrictions',
      paragraphs: [
        'Subject to your plan and these Terms, we grant you a limited, nonexclusive, nontransferable right to access the service for your legitimate business purposes. You may share ordinary reports with your organization, clients or professional advisers only as your plan allows and with appropriate confidentiality and context. Do not resell platform access, publish private records, create a competing database by bulk extraction, scrape or automate access without permission, defeat rate limits or free search limits, reverse engineer protected software except as law permits, introduce malware, disrupt systems, or use information to harass, discriminate unlawfully or commit fraud. These restrictions do not claim ownership of public domain government records obtained independently.',
      ],
    },
    {
      heading: '8 Your content and attachments',
      paragraphs: [
        'You retain ownership of documents, messages and other content you submit, subject to third party rights. You grant STS a limited license to host, store, copy, process and transmit that content only as necessary to provide requested services, secure and support the application, comply with law and manage permitted retention. This includes use by relevant service providers and transmission to agencies for an authorized filing. It does not grant permission to publish private evidence or sell attachments for advertising. You warrant that you have authority to submit the content and permit the requested processing. Minimize and redact unrelated personal data; do not upload passwords, payment card data or unrelated medical or government identifier records.',
      ],
    },
    {
      heading: '9 DataQs and government access',
      paragraphs: [
        'A DataQs request does not guarantee acceptance, correction, removal, a favorable decision or a particular completion date. Agencies control their procedures, decisions and source records. You must provide truthful, complete evidence, review submissions when requested, respond promptly and expressly authorize STS to act within the agreed scope. These Terms do not appoint STS as a general agent or attorney. Government rules and account permissions govern access. Use approved representative or associate access where available. Do not provide another person’s credentials or bypass government security restrictions. If an optional code collection workflow is enabled and permitted, approve only a specific authorized request you initiated; never send codes in ordinary tickets or email. STS may decline a request if authority, evidence or lawful access is insufficient.',
      ],
    },
    {
      heading: '10 Emails texts and calls',
      paragraphs: [
        'We send operational messages such as account confirmation, password resets, billing notices and case updates. If a text or automated call feature is offered, any required consent must be obtained separately at the point of enrollment, with applicable disclosures; accepting these Terms alone does not constitute marketing or automated call consent. Message and data rates may apply. Follow the opt out instructions supplied with that feature or contact support. Choosing not to use optional calls or texts may require another supported verification process. Do not rely on email or text delivery as your only deadline reminder.',
      ],
    },
    {
      heading: '11 Trials subscriptions and charges',
      paragraphs: [
        'The plan, price, billing interval, trial length, usage limits and cancellation terms must be displayed before purchase. Unless a checkout disclosure says otherwise and you expressly agree, a free trial does not authorize a charge. A recurring subscription renews only on the terms disclosed at enrollment and with any required affirmative consent. You authorize Stripe to process the disclosed amounts and applicable taxes. We provide required renewal notices and cancellation methods under applicable law. Changes in recurring prices apply prospectively after required notice and consent where required. A separate accepted order governs one time services, agency fees and scope. CarrierSafetyScan fees are separate from government charges unless expressly included.',
      ],
    },
    {
      heading: '12 Cancellation refunds and account closure',
      paragraphs: [
        'Cancel a subscription using the method disclosed at checkout, including any legally required online cancellation mechanism; support can assist if it fails. Unless disclosed otherwise, cancellation stops the next renewal and access continues through the paid period. Amounts already paid are nonrefundable to the extent permitted by law, except as stated in an accepted order, required by law or agreed by STS. Unperformed service work and government fees are handled under the applicable order and law. You may request account deletion by an administrator ticket or by the Privacy Policy contact methods. We will confirm how closure affects access and outstanding services. Account deletion and subscription cancellation are distinct requests; tell us if you want both. We will not require a privacy request to be withdrawn as a condition of cancellation.',
      ],
    },
    {
      heading: '13 Government and third party services',
      paragraphs: [
        'Government sites, source datasets, payment processing, Google sign in and other linked services have their own terms and privacy practices. Availability can depend on them. We do not control their decisions or guarantee continued access. We may change integrations or suspend an affected feature when a provider or agency changes its rules. Any material reduction in a prepaid service will be addressed under the applicable order and mandatory law.',
      ],
    },
    {
      heading: '14 Ownership and feedback',
      paragraphs: [
        'STS and its licensors retain rights in CarrierSafetyScan software, design, branding and original materials. Government records and your content remain subject to their respective ownership rules. No government endorsement is implied by a source name or logo. If you voluntarily provide product feedback, you permit us to use it to improve the service without payment, excluding your private records or confidential content.',
      ],
    },
    {
      heading: '15 Suspension termination and export',
      paragraphs: [
        'We may restrict or suspend access for a material breach, security threat, unlawful activity, nonpayment or a legal requirement. When practical and lawful, we will give notice and an opportunity to cure; immediate action may be necessary for security or legal reasons. You may stop using the service and request closure. Before closure, request copies of your submitted information through support; exports are subject to identity checks, other people’s rights and technical availability. Termination does not erase accrued payment obligations or mandatory refund and privacy rights. Content retention and deletion follow the Privacy Policy.',
      ],
    },
    {
      heading: '16 Disclaimers',
      paragraphs: [
        'TO THE FULLEST EXTENT PERMITTED BY LAW, THE SERVICE AND INFORMATION ARE PROVIDED AS IS AND AS AVAILABLE. STS DISCLAIMS IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON INFRINGEMENT, AND DOES NOT WARRANT COMPLETENESS, ACCURACY, CONTINUOUS AVAILABILITY OR A PARTICULAR COMPLIANCE OR BUSINESS OUTCOME. These limitations do not override express commitments in a signed order or warranties and rights that cannot lawfully be excluded.',
      ],
    },
    {
      heading: '17 Limits of liability',
      paragraphs: [
        'TO THE FULLEST EXTENT PERMITTED BY LAW, STS IS NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR LOST PROFITS, REVENUE OR BUSINESS OPPORTUNITIES ARISING FROM THE SERVICE. STS’S TOTAL LIABILITY ARISING FROM THE SERVICE WILL NOT EXCEED THE GREATER OF USD 100 OR THE AMOUNT YOU PAID STS FOR CARRIERSAFETYSCAN DURING THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM. These exclusions and cap do not apply to fraud, willful misconduct, gross negligence, statutory privacy liabilities that cannot be limited, or any other liability that applicable law prohibits excluding or limiting. They apply only to the extent enforceable and do not prevent mandatory statutory remedies.',
      ],
    },
    {
      heading: '18 Third party claims',
      paragraphs: [
        'If you use the service for a business, you agree, to the extent permitted by law, to defend and indemnify STS against third party claims and reasonable costs resulting from your unlawful misuse, unauthorized content or material breach of these Terms. This duty does not cover claims caused by STS’s negligence, misconduct or violation of law. STS will give prompt notice, reasonable cooperation at your expense and appropriate control of the defense, subject to its right to participate. No settlement may admit fault by STS or impose nonmonetary obligations on STS without its written consent.',
      ],
    },
    {
      heading: '19 Law and disputes',
      paragraphs: [
        'California law governs these Terms, without displacing mandatory protections that apply to you. Subject to nonwaivable jurisdiction and venue rules, disputes may be brought in state courts in San Joaquin County, California, or the federal court with jurisdiction over that county. Please contact us first to seek an informal resolution; this does not delay statutory deadlines or restrict urgent relief. These Terms do not impose mandatory arbitration or a class action waiver.',
      ],
    },
    {
      heading: '20 Changes and general terms',
      paragraphs: [
        'We may update these Terms prospectively. We will identify the effective date and give reasonable notice of material changes, obtaining renewed assent when required. Changes do not retroactively alter an existing dispute. A signed agreement or accepted order controls a direct conflict concerning its specific service; these Terms otherwise apply. If a provision is unenforceable, the remainder continues to the extent lawful. Failure to enforce a provision is not a waiver. You may not transfer an account or agreement without consent; STS may transfer it with the business subject to applicable law and continued obligations. Provisions that reasonably need to survive termination, including payment, ownership, lawful retention and liability provisions, survive.',
      ],
    },
    {
      heading: '21 Contact',
      paragraphs: [
        'CarrierSafetyScan, Sky Transport Solutions, 121 E 11th St, Tracy, CA 95376. Email: info@skytransportsolutions.com. Telephone: (800) 498-9820. Current application address: https://carriersafetyscan.com',
      ],
    },
  ],
}

export const PRIVACY_POLICY: LegalDocument = {
  title: 'CarrierSafetyScan Privacy Policy',
  sections: [
    {
      heading: '1 About this policy',
      paragraphs: [
        'Sky Transport Solutions (we, us, or STS) operates CarrierSafetyScan, a business application that tracks public motor carrier information and provides compliance tools to motor carriers, freight brokers, insurance agents and companies, and STS staff. This policy explains how we handle information about account holders, visitors, individuals identified in public records, and people whose information appears in submitted documents. It applies to CarrierSafetyScan and its related support and service communications.',
      ],
    },
    {
      heading: '2 Information you provide',
      paragraphs: [
        'Account and company information includes your name, email address, mobile number, company name and type, password authentication information, email confirmation and last login details, and Google account identifier if you choose Google sign in. We collect USDOT or MC numbers for carriers and brokers and National Producer Numbers for insurance agents. STS staff verify links between carrier accounts and USDOT numbers to control access to carrier records.',
      ],
    },
    {
      heading: '3 Payments and service records',
      paragraphs: [
        'We keep trial dates, subscription status and periods, Stripe customer and subscription identifiers, invoice bill to information, amounts, payment status, and paid, voided or refunded dates. Stripe receives payment card information directly; CarrierSafetyScan does not receive or store your full card details. Service requests may include the requested service, notes, options, quantity, amount, requester and assigned handler.',
      ],
    },
    {
      heading: '4 Cases attachments and communications',
      paragraphs: [
        'For DataQs assistance, we collect inspection, citation and police report numbers, event dates and states, case history and status, messages with STS, agency correspondence, and evidence attachments. These documents may contain personal information about drivers or other people. Upload only information you are authorized to provide and that is necessary for the request. Redact unrelated identifiers and sensitive material. Support tickets, including deletion requests, contain the information you provide to our administrators. Contact form submissions include name, email, phone, company, USDOT number and message; they are emailed to STS rather than stored in the application database. Copies may remain in the email system.',
      ],
    },
    {
      heading: '5 Government authentication codes',
      paragraphs: [
        'If enabled for an authorized DataQs service, we may use text messages or automated calls to request a one time FMCSA authentication code. The application retains a submitted code only until used or for up to 10 minutes, whichever occurs first, and does not log or email it. Use this process only for a request you initiated and are authorized to approve. Never send account passwords or authentication codes through ordinary support tickets or email. This feature does not authorize access that government system rules prohibit.',
      ],
    },
    {
      heading: '6 Public carrier information',
      paragraphs: [
        'We obtain public carrier and vehicle information from FMCSA, data.transportation.gov and NHTSA vPIC. Records can include company officers’ names, business phone numbers, email addresses and business addresses, inspections, crashes and vehicle identification numbers. Public records may identify individuals, particularly sole proprietors. We display these records to permitted users, including brokers and insurers, as part of the service. A record appearing in our application does not mean that the person created an account or supplied the information to us.',
      ],
    },
    {
      heading: '7 Technical information and free searches',
      paragraphs: [
        'For the free Try Now search, the application stores a keyed one way hash of the visitor’s internet address and the USDOT number searched to enforce the free search limit. This hash is an identifier and is not necessarily anonymous. Hosting, security and communications providers may process internet addresses and technical request information to deliver and protect the service. The application’s code has advertising or analytics trackers such as Google Analytics.',
      ],
    },
    {
      heading: '8 Why we use information',
      paragraphs: [
        'We use information to create and authenticate accounts; verify company roles and access; retrieve and display carrier data; provide requested compliance and DataQs services; manage subscriptions, invoices and payments; send confirmations, password resets and service updates; answer inquiries and deletion requests; prevent abuse and unauthorized access; and maintain records needed for legal obligations, disputes and enforcement. We use authentication information to secure access, not to build advertising profiles.',
      ],
    },
    {
      heading: '9 Who receives information',
      paragraphs: [
        'Authorized STS personnel access information needed for their work. Public carrier records are available to the service’s permitted audiences. Account information, case messages and private evidence are not made public merely because you upload them. They may be accessed by authorized personnel and service providers and disclosed to the reviewing government agency or other recipient as necessary for an authorized service. STS internal notes and signals are not displayed to carriers, brokers or agents. Organization administrators may manage access for their organization; do not assume a business account is a personal workspace.',
      ],
    },
    {
      heading: '10 Service providers',
      paragraphs: [
        'Our providers include Vercel for website hosting; Render for the API server; Supabase for the database and private DataQs evidence storage in the US East region; Stripe for payment processing; Google for optional sign in and email delivery through Gmail; Cloudflare for Turnstile bot protection; and Twilio for texts and automated calls if enabled. Providers receive information relevant to their functions. USDOT numbers and VINs are sent to government data services for lookups rather than account profile details. Providers may also process information under their own applicable privacy notices.',
      ],
    },
    {
      heading: '11 Other disclosures',
      paragraphs: [
        'We may disclose information when reasonably necessary to comply with law or valid legal process, protect rights and security, investigate misuse, or respond to emergencies. If the business or application is involved in a merger, acquisition or asset transfer, information may be transferred subject to applicable law and appropriate notice. We may also disclose information at your direction or with your permission.',
      ],
    },
    {
      heading: '12 Cookies and browser storage',
      paragraphs: [
        'We use cookies and browser storage for authentication, security, free search access and preferences. Blocking them may prevent features from working. The carrieriq names below are internal technical names used by CarrierSafetyScan. Third party bot protection may involve Cloudflare cookies or related browser processing. You can clear cookies and storage through your browser settings.',
      ],
      table: {
        head: ['Storage', 'Purpose', 'Duration'],
        rows: [
          ['carrieriq_session', 'Signed in session', '8 hours'],
          [
            'carrieriq_google_state and carrieriq_google_portal',
            'Google sign in security',
            '10 minutes',
          ],
          ['carrieriq_google_signup', 'Complete Google registration', '30 minutes'],
          ['carrieriq_try', 'Selected free search access', '30 minutes'],
          ['carrieriq_try_used', 'Remember free search use', '400 days'],
          ['theme in local storage', 'Light or dark preference', 'Until cleared'],
          ['Compare list in session storage', 'Selected carriers', 'Until tab closes'],
          ['Cloudflare Turnstile', 'Bot protection', 'Set by Cloudflare'],
        ],
      },
    },
    {
      heading: '13 Retention and deletion',
      paragraphs: [
        'We retain information for as long as reasonably necessary for the purposes described here, considering account activity, service and case status, tax and accounting duties, security needs, legal requirements and disputes. Account, invoice and DataQs records do not currently have an automatic deletion schedule. We review verified requests individually and may retain records when legally permitted or required. Closing an account does not necessarily delete invoices, case records, email copies, backups or information another organization is entitled to retain. Retained information remains subject to this policy and is restricted to the purpose for retention. Backup copies may remain until their normal replacement cycle and should not be restored to active use except where necessary. Authentication codes and browser storage have the shorter periods described in this policy.',
      ],
    },
    {
      heading: '14 Access correction and account deletion',
      paragraphs: [
        'You can submit a ticket to administrators requesting access, correction or account deletion. You may also email info@skytransportsolutions.com, call (800) 498-9820, or write to the address below; an account is not required to make a privacy request. Identify CarrierSafetyScan, the request type and enough information to locate relevant records. Do not include passwords, authentication codes or unnecessary identity documents. We may verify identity and authority using information proportionate to the request. An authorized agent may submit a request, subject to verification of permission and identity where allowed. We will explain any refusal or partial fulfillment and provide available review or appeal options required by applicable law. We respond within applicable legal deadlines.',
      ],
    },
    {
      heading: '15 Public record corrections',
      paragraphs: [
        'Deleting a CarrierSafetyScan account does not delete government records or records another user lawfully holds. To correct the underlying FMCSA record, use the relevant agency process, including DataQs where appropriate. You can also ask us to review a display error or applicable privacy request. We assess whether information qualifies as publicly available under the governing law rather than treating every government sourced field as automatically exempt.',
      ],
    },
    {
      heading: '16 California and other privacy rights',
      paragraphs: [
        'Depending on your residence and whether a law applies to STS and the information involved, you may have rights to know and access personal information, receive a portable copy, correct inaccuracies, delete information, opt out of sale or sharing or certain profiling and targeted advertising, limit certain uses of sensitive personal information, and receive equal treatment for exercising rights. Some laws provide an appeal right. Business contact and sole proprietor information can require a separate analysis from public company information. Use the methods above to exercise rights. Where the CCPA applies, we generally acknowledge covered access, correction and deletion requests within 10 business days and respond within 45 calendar days, with legally permitted extensions and notice.',
      ],
    },
    {
      heading: '17 Sale sharing and privacy signals',
      paragraphs: [
        'We do not use account information or private attachments for targeted advertising. The current application code does not implement advertising trackers or a mechanism to sell account information. We provide access to public carrier information, including through paid subscriptions. Whether any disclosure constitutes a statutory sale or sharing depends on the information and applicable law; the absence of advertising does not resolve that question. Where an opt out obligation applies, we honor valid requests and legally required browser opt out preference signals such as Global Privacy Control. Contact us using the methods above to submit an opt out request.',
      ],
    },
    {
      heading: '18 Security and location',
      paragraphs: [
        'We use safeguards designed to protect information, including salted scrypt password hashes, HttpOnly login cookies, email confirmation, bot controls, access restrictions and rate limits. No system can guarantee complete security. Protect your credentials and tell us promptly about suspected unauthorized access. The service uses US infrastructure, including Supabase storage in US East, and providers may process information in other locations. Access from outside the United States may involve transfer to the United States.',
      ],
    },
    {
      heading: '19 Children and changes',
      paragraphs: [
        'CarrierSafetyScan is intended for business users aged 18 or older and is not directed to children. If you believe a child has provided personal information, contact us. We may revise this policy to reflect changes in practices or law. We will update the effective date and provide additional notice or obtain consent when legally required. Posting a policy does not replace consent where consent is required.',
      ],
    },
    {
      heading: '20 Contact',
      paragraphs: [
        'Privacy contact: CarrierSafetyScan Privacy Team, Sky Transport Solutions, 121 E 11th St, Tracy, CA 95376. Email: info@skytransportsolutions.com. Telephone: (800) 498-9820. Current application address: https://carriersafetyscan.com',
      ],
    },
  ],
}
