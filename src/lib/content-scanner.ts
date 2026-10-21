// Prohibited content categories per carrier SHAFT policies + regional laws
// + lender / fraud / scam restrictions enforced by US/CA carriers and Twilio AUP.
export const PROHIBITED_CATEGORIES = [
  "sexual",
  "hate_speech",
  "alcohol",
  "firearms",
  "tobacco",
  "cannabis_cbd",
  "illegal_drugs",
  "gambling",
  "payday_loans",
  "debt_collection",
  "crypto_scam",
  "get_rich_quick",
  "fraud_deceptive",
  "brand_impersonation",
  "phishing",
] as const;

export type ProhibitedCategory = (typeof PROHIBITED_CATEGORIES)[number];

export interface ScanResult {
  allowed: boolean;
  reason?: string;
  category?: ProhibitedCategory;
  confidence: "keyword" | "ai" | "none";
  details?: string;
  /**
   * True when the AI review could not run at all (provider error, exhausted
   * credits, no provider configured). The message is NOT considered screened
   * by AI — callers must record this instead of treating it as a pass.
   */
  unavailable?: boolean;
  /** Short machine reason for `unavailable` (e.g. "payment_required"). */
  unavailableCode?: string;
}

const CONTEST_OR_BONUS_REGEX = /\b(?:contest|competition|matching bonus|match(?:ing)? reward)\b/i;
const EXPLICIT_GAMBLING_REGEX =
  /\b(?:bet(?:ting)?|wager(?:ing)?|gambl(?:e|ing)|casino|sportsbook|odds|stake|jackpot|lottery|slots?|poker|roulette|blackjack|free spins?|deposit bonus|no deposit bonus)\b/i;

/**
 * Community contests and ordinary loyalty bonuses are not gambling merely
 * because they use "contest" or "matching bonus" language. This guard is
 * deliberately narrow: any explicit betting, casino, deposit, or wagering
 * signal keeps the message eligible for a gambling block.
 */
export function isContestPromotionWithoutGamblingSignals(text: string): boolean {
  return CONTEST_OR_BONUS_REGEX.test(text) && !EXPLICIT_GAMBLING_REGEX.test(text);
}

// Fast keyword patterns (case-insensitive). Tuned to minimize false positives:
// patterns require commercial/promotional context (buy/order/shop/sale/free trial)
// where a bare word would over-block.
const KEYWORD_PATTERNS: Array<{
  category: ProhibitedCategory;
  patterns: RegExp[];
  severity: "block" | "flag";
}> = [
  {
    category: "tobacco",
    severity: "block",
    patterns: [
      /\b(cigarettes?|cigars?|tobacco|nicotine|vape|vaping|e[-\s]?cig|e[-\s]?liquid|e[-\s]?juice|hookah|shisha|snus|chewing tobacco|smokeless tobacco|iqos|heat[-\s]?not[-\s]?burn)\b/gi,
      /\b(puff bar|elf bar|disposable vape|vape pen|vape kit|vape shop|vape store|vape juice|nicotine salt|salt nic)\b/gi,
      /\b(marlboro|camel|cigarette brand|tobacco product|tobacco company)\b/gi,
    ],
  },
  {
    category: "cannabis_cbd",
    severity: "block",
    patterns: [
      /\b(cbd|thc|cannabis|marijuana|weed|hashish|hash oil|edibles?|delta[-\s]?(8|9|10)|hhc|cbd oil|cbd gummy|cbd gummies)\b/gi,
      /\b(420|kush|dispensary|cannabis store|grow shop|pre[-\s]?roll|vape cart|cannabis delivery)\b/gi,
    ],
  },
  {
    category: "alcohol",
    severity: "block",
    patterns: [
      /\b(buy (beer|wine|vodka|whiskey|whisky|rum|gin|tequila|alcohol|liquor|spirits))\b/gi,
      /\b(alcohol delivery|wine club|liquor store|hard seltzer|booze)\b/gi,
      /\b(happy hour|drink special|bar crawl|get drunk)\b/gi,
    ],
  },
  {
    category: "firearms",
    severity: "block",
    patterns: [
      /\b(buy (gun|guns|rifle|pistol|firearm|weapon|ammo|ammunition|magazine|suppressor|silencer))\b/gi,
      /\b(gun store|firearm dealer|ghost gun|concealed carry|open carry|ar[-\s]?15|ak[-\s]?47)\b/gi,
    ],
  },
  {
    category: "illegal_drugs",
    severity: "block",
    patterns: [
      /\b(buy (pills?|oxycodone|xanax|adderall|tramadol|fentanyl|heroin|meth|cocaine|ecstasy|mdma|ketamine|lsd|shrooms?|psilocybin))\b/gi,
      /\b(prescription (without|no) (rx|prescription)|pill mill|no rx needed|cheap rx)\b/gi,
      /\b(research chemicals|rc vendor)\b/gi,
    ],
  },
  {
    category: "gambling",
    severity: "block",
    patterns: [
      /\b(casino|sportsbook|poker room|blackjack|roulette|slot machine|lottery|jackpot|scratch[-\s]?off)\b/gi,
      /\b(bet now|place your bet|wager|parlay|free spins|deposit bonus|no deposit bonus)\b/gi,
      /\b(online casino|gambling site|betting app|sports betting)\b/gi,
      /\b(sports? bettor|sports? handicapper|betting picks?|sports? picks?|winning picks?)\b/gi,
      /\b(?:free|paid|premium|daily)\s+(?:ncaa|nfl|nba|nhl|mlb|football|basketball|baseball|hockey)\s+(?:winner|pick|lock|play)\b/gi,
    ],
  },
  {
    category: "payday_loans",
    severity: "block",
    patterns: [
      /\b(payday loan|payday advance|cash advance|fast cash|instant cash|short[-\s]?term loan)\b/gi,
      /\b(no credit check loan|bad credit loan|title loan|car title loan|same day loan|loan in minutes)\b/gi,
      /\b(\d{2,3}% apr|high[-\s]?interest loan)\b/gi,
    ],
  },
  {
    category: "debt_collection",
    severity: "block",
    patterns: [
      /\b(debt collector|collection agency|collection notice|outstanding debt|past due balance|unpaid balance)\b/gi,
      /\b(debt relief|debt consolidation|settle your debt|reduce your debt|wipe out debt|tax debt relief)\b/gi,
      /\b(garnish(ment)?|lawsuit (will be|may be) filed)\b/gi,
    ],
  },
  {
    category: "crypto_scam",
    severity: "block",
    patterns: [
      /\b(crypto giveaway|free bitcoin|free btc|free eth|double your (btc|eth|crypto|coins))\b/gi,
      /\b(pump and dump|guaranteed (\d+x|returns?)|moonshot coin|presale (alert|opportunity)|airdrop claim)\b/gi,
      /\b(elon (gift|giveaway)|musk bitcoin|tesla btc)\b/gi,
    ],
  },
  {
    category: "get_rich_quick",
    severity: "block",
    patterns: [
      /\b(get rich quick|make \$?\d{3,}[k]? (a|per) (day|week|month) from home)\b/gi,
      /\b(work from home (and )?(earn|make) \$?\d{3,})\b/gi,
      /\b(passive income system|secret system|financial freedom blueprint|millionaire mindset method)\b/gi,
      /\b(no experience needed.*earn|guaranteed income|risk[-\s]?free profits?)\b/gi,
    ],
  },
  {
    category: "fraud_deceptive",
    severity: "block",
    patterns: [
      /\b(you('?ve)? won|congratulations.*winner|claim your prize|claim your reward|gift card winner)\b/gi,
      /\b(irs (notice|warning|final notice)|social security (suspended|number suspended)|warrant for your arrest)\b/gi,
      /\b(package (held|delayed|undeliverable).*click|usps.*reschedule.*click|fedex.*verify)\b/gi,
      /\b(refund pending|tax refund waiting|stimulus payment available)\b/gi,
    ],
  },
  {
    category: "sexual",
    severity: "block",
    patterns: [
      /\b(escort|prostitute|brothel|sex worker|adult service|massage parlor)\b/gi,
      /\b(porn|xxx|onlyfans|cam girl|live nude)\b/gi,
    ],
  },
  {
    category: "hate_speech",
    severity: "block",
    patterns: [/\b(kkk|nazi|white supremacist|hate group|terrorist|radicalize|violence against)\b/gi],
  },
  {
    // Impersonating financial, crypto or big-tech brands is the pattern that
    // gets the whole carrier account blocked, so it is a hard block.
    category: "brand_impersonation",
    severity: "block",
    patterns: [
      /\b(coinbase|binance|kraken|metamask|trust ?wallet|blockchain\.com|crypto\.com|ledger live|exodus wallet|phantom wallet)\b/gi,
      /\b(seed phrase|recovery phrase|secret phrase|private key|wallet (connect|verification|verify|sync|validation))\b/gi,
      /(?<![\w-])(paypal|cash ?app|venmo|zelle|chase|wells fargo|bank of america|citibank|capital one|amex|american express|apple id|icloud|amazon|netflix|microsoft|outlook|gmail|usps|fedex|dhl|ups|irs|hmrc)(?![\w-])[\s\S]{0,160}\b(verify|unlock|suspended|locked|restricted|compromised|unauthori[sz]ed|reactivate|validate)\b/gi,
      /\b(verify|unlock|suspended|locked|restricted|compromised|unauthori[sz]ed|reactivate|validate)\b[\s\S]{0,160}(?<![\w-])(paypal|cash ?app|venmo|zelle|chase|wells fargo|bank of america|citibank|capital one|amex|american express|apple id|icloud|amazon|netflix|microsoft|outlook|gmail|usps|fedex|dhl|ups|irs|hmrc)(?![\w-])/gi,
    ],
  },
  {
    category: "phishing",
    severity: "block",
    patterns: [
      /\b(your|the) (account|wallet|card|payment|withdrawal|transfer)\b[\s\S]{0,60}\b(has been|was|is|will be) (suspended|locked|restricted|compromised|frozen|disabled|on hold)\b/gi,
      /\b(unauthori[sz]ed|unusual|suspicious) (login|sign[- ]?in|transaction|withdrawal|access|activity|charge)\b/gi,
      /\bverify your (identity|account|wallet|card|login)\b/gi,
      /\b(account (locked|suspended|frozen|restricted)|login to (restore|unlock|secure)|secure your (wallet|funds))\b/gi,
      /\b(click here to verify)\b/gi,
    ],
  },
  {
    // Ordinary businesses use this wording too: hold for review, never
    // a hard block or automatic suspension.
    category: "phishing",
    severity: "flag",
    patterns: [
      /\bconfirm your (identity|account|card|details|information|login)\b/gi,
      /\b(suspicious activity|update your payment)\b/gi,
      /\burgent action required\b/gi,
      // Carriers commonly reject unsolicited filing/compliance notices that
      // combine an action command with a link, even when the destination is a
      // real business website. Hold these for review before a bulk send rather
      // than learning from thousands of paid 40002 delivery failures.
      /\b(?:filing|compliance)\s+(?:step|report|notice|status)\b[\s\S]{0,180}\b(?:file|submit|complete|review|act|click)\s+(?:now|here|today)\b/gi,
      /\b(?:file|submit|complete|review)\s+(?:now|here|today)\b[\s\S]{0,180}\b(?:filing|compliance)\s+(?:step|report|notice|status)\b/gi,
      // Linked company-information demands must not depend on a fresh AI
      // opinion or a tracking code. Hold them consistently for safety review;
      // this is a flag, not evidence for an immediate hard-category suspension.
    ],
  },
];

export function keywordScan(text: string): ScanResult {
  const lower = text.toLowerCase();

  for (const group of KEYWORD_PATTERNS) {
    for (const pattern of group.patterns) {
      const matches = lower.match(pattern);
      if (matches && matches.length > 0) {
        return {
          allowed: group.severity === "flag",
          category: group.category,
          confidence: "keyword",
          reason:
            group.severity === "block"
              ? `Message contains prohibited content related to ${group.category.replace(/_/g, " ")}.`
              : `Message may contain ${group.category.replace(/_/g, " ")} content — review before sending.`,
          details: matches.slice(0, 3).join(", "),
        };
      }
    }
  }

  return { allowed: true, confidence: "none" };
}

/**
 * True when the campaign template itself is clean but one recipient's
 * personalised text trips a hard keyword block (e.g. a contact saved as
 * "… Concealed Carry Training"). Only that recipient should be skipped;
 * the template's own content was already screened.
 */
export function isPersonalizationOnlyBlock(template: string, rendered: string): boolean {
  const t = keywordScan(template);
  if (t.confidence === "keyword" && !t.allowed) return false;
  const r = keywordScan(rendered);
  return r.confidence === "keyword" && !r.allowed;
}
