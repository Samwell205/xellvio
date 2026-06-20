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
  "phishing",
] as const;

export type ProhibitedCategory = (typeof PROHIBITED_CATEGORIES)[number];

export interface ScanResult {
  allowed: boolean;
  reason?: string;
  category?: ProhibitedCategory;
  confidence: "keyword" | "ai" | "none";
  details?: string;
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
    patterns: [
      /\b(kkk|nazi|white supremacist|hate group|terrorist|radicalize|violence against)\b/gi,
    ],
  },
  {
    category: "phishing",
    severity: "flag",
    patterns: [
      /\b(verify your account|suspicious activity|account locked|click here to verify|update your payment)\b/gi,
      /\burgent action required\b/gi,
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
