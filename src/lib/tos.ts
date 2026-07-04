// Xellvio Terms of Service, Acceptable Use Policy and liability disclosures.
// Every tenant MUST have an acceptance record matching TOS_CURRENT_VERSION
// before their account can send. Bump the version to force re-acceptance.

export const TOS_CURRENT_VERSION = "2026-07-03.v1";

export const TOS_PROHIBITED_CATEGORIES: readonly string[] = [
  "Sexual, adult, or explicit content",
  "Hate speech, harassment, or threats",
  "Firearms, ammunition, or weapon accessories",
  "Alcohol, tobacco, vaping, cannabis, CBD, or controlled substances",
  "Prescription pharmaceuticals or illegal drugs",
  "Gambling, sports betting, lotteries, or casino promotions",
  "Cryptocurrency promotions, airdrops, giveaways, and OTP-relay services",
  "Payday, high-APR, tax-relief, or predatory lending; debt collection or credit repair",
  "Multi-level marketing, pyramid schemes, or unsolicited real estate outreach",
  "Phishing, account-verification, or 'urgent action required' style content",
  "Anything prohibited by Telnyx's Acceptable Use Policy or applicable law " +
    "(TCPA, TCR/CTIA, CASL, GDPR, or the destination country's telecom regulator).",
];

export const TOS_LEGAL_TEXT = `# Xellvio Terms of Service, Acceptable Use Policy & Liability Agreement
Version ${TOS_CURRENT_VERSION}

By clicking "I accept" you (the "Tenant") agree to the following terms in
addition to any other agreement you have with Xellvio ("Xellvio", "we",
"us"). These terms cover every message sent through your Xellvio account and
every recipient uploaded to it.

## 1. Consent and Opt-In (You Are the Data Controller)

You confirm and warrant that, for every phone number, contact record, or
recipient uploaded, imported, purchased, integrated, or otherwise added to
your Xellvio account:

  (a) You have obtained clear, express, written or record-keeping-compliant
      opt-in consent from that individual to receive SMS or MMS marketing,
      transactional, or informational messages from you.
  (b) The consent record includes the date, source (e.g. web form, POS
      terminal, in-store sign-up, order checkout box), and the language the
      recipient agreed to at time of opt-in.
  (c) You will produce that consent record within 72 hours of a request from
      Xellvio, from a carrier, from Telnyx, or from a regulator.
  (d) You will honor every opt-out request (STOP, UNSUBSCRIBE, CANCEL, END,
      QUIT and all localized equivalents) immediately and permanently.
  (e) You will not re-onboard, re-import, or re-send to any recipient who has
      opted out, unless they explicitly re-subscribe.

## 2. Acceptable Use Policy

You will not send content in any of the following categories through Xellvio:

${TOS_PROHIBITED_CATEGORIES.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}

You will not use Xellvio to send spam, unsolicited commercial messages, chain
messages, mass forwarded content, or any content that violates the SHAFT
(Sex, Hate, Alcohol, Firearms, Tobacco/Cannabis) restrictions enforced by
North American mobile carriers and the CTIA Short Code Monitoring
guidelines. You will comply with the Telephone Consumer Protection Act (TCPA)
in the United States, the Canadian Anti-Spam Legislation (CASL) in Canada,
the General Data Protection Regulation (GDPR) and ePrivacy Directive for
recipients in the European Economic Area and United Kingdom, and any local
telecom regulator's requirements in the destination country.

## 3. Content Screening and Immediate Suspension

You acknowledge and agree that Xellvio operates automated pre-send content
screening and may, at any time, without prior notice:

  (a) Refuse to send any specific message that fails screening.
  (b) Hold any message for manual review before delivery.
  (c) Pause your Messaging Profile's ability to send in whole or in part.
  (d) Immediately suspend your account, revoke your access, and preserve
      logs and consent evidence for regulatory disclosure.

Xellvio may take these actions in response to internal screening signals,
carrier complaints, regulator inquiries, opt-out spikes, elevated 30007/30008
delivery errors, or upstream instruction from Telnyx or a mobile network
operator.

## 4. Tenant Liability and Indemnification

You accept full and exclusive responsibility for:

  (a) The content of every message you send;
  (b) The lawful basis on which you send it;
  (c) Any carrier fines, TCR penalties, class-action exposure, arbitration
      awards, injunctions, or civil damages arising from your content or
      consent practices;
  (d) Any suspension, termination, penalty, or number reclamation imposed by
      Telnyx, a mobile network operator, a carrier, or a regulator against
      your account, your numbers, your alphanumeric sender IDs, your 10DLC
      brand or campaign, your toll-free verification, or any Xellvio
      infrastructure used to send your messages.

You will defend, indemnify, and hold harmless Xellvio, its officers,
employees, contractors, suppliers, and its upstream messaging infrastructure
provider from and against every claim, action, cost, fine, penalty,
settlement, attorneys' fee, or damage arising from (i) your content, (ii)
your recipients, (iii) your consent handling, or (iv) any violation of this
agreement or applicable law by you or anyone you authorize to use your
account.

## 5. No Warranty; Limitation of Liability

Xellvio delivers messages on a best-effort basis via third-party carriers.
Xellvio is not liable for:

  (a) Delivery failures caused by carrier filtering, blocking, blacklisting,
      or content moderation of your messages;
  (b) Account restrictions, number reclamation, or brand/campaign
      de-registration imposed on your account due to your content, your
      consent practices, or complaints about your messages;
  (c) Consequential, incidental, indirect, or lost-profit damages;
  (d) Any amount exceeding the fees you paid Xellvio in the 12 months
      preceding the event giving rise to the claim.

## 6. Retention of Evidence

You authorize Xellvio to retain, for as long as is legally advisable,
including after account termination: screening decisions, opt-in records you
have supplied, opt-out records generated by the platform, message content,
recipient identifiers, and administrative actions taken against your
account. This evidence may be disclosed to Telnyx, carriers, regulators, or
courts under lawful request.

## 7. Version Control and Re-Acceptance

Xellvio may amend this agreement. Where an amendment materially expands your
obligations, Xellvio will re-require your acceptance by refusing to send new
campaigns until you accept the new version. Continued use after re-acceptance
constitutes agreement to the amended terms.

## 8. Governing Law and Venue

These terms are governed by the law and courts specified in Xellvio's master
customer agreement or, absent one, the law of the Xellvio operating entity's
place of incorporation, without regard to conflict-of-law rules.

By checking the acceptance box and clicking to create your account, launch a
campaign, or continue after re-acceptance, you (personally, or on behalf of
your organization if signing in a representative capacity) accept and agree
to be legally bound by these terms.`;
