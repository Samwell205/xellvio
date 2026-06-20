// Prohibited content categories per carrier SHAFT policies + regional laws
export const PROHIBITED_CATEGORIES = [
  "sexual",
  "hate_speech",
  "alcohol",
  "firearms",
  "tobacco",
  "drugs",
  "gambling",
  "cbd_vape",
  "cryptocurrency_scam",
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

// Fast keyword patterns (case-insensitive, word boundaries where needed)
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
    category: "cbd_vape",
    severity: "block",
    patterns: [
      /\b(cbd|thc|cannabis|marijuana|weed|pot|hash|edible|gummy|delta[-\s]?(8|9|10)|hhc|cbd oil|cbd gummy)\b/gi,
      /\b(420|kush|strain|bud|flower|dispensary|cannabis store)\b/gi,
    ],
  },
  {
    category: "alcohol",
    severity: "block",
    patterns: [
      /\b(buy (beer|wine|vodka|whiskey|whisky|rum|gin|tequila|alcohol|liquor|spirits))\b/gi,
      /\b(alcohol delivery|wine club|liquor store|booze|hard seltzer)\b/gi,
      /\b(get drunk|drink special|happy hour|bar crawl| shots?)\b/gi,
    ],
  },
  {
    category: "firearms",
    severity: "block",
    patterns: [
      /\b(buy (gun|rifle|pistol|firearm|weapon|ammo|ammunition|magazine|suppressor))\b/gi,
      /\b(gun store|firearm dealer| concealed carry|open carry)\b/gi,
    ],
  },
  {
    category: "gambling",
    severity: "block",
    patterns: [
      /\b(casino|betting|sportsbook|poker|blackjack|roulette|slot machine|lottery|jackpot)\b/gi,
      /\b(bet now|place your bet|wager|odds|spread|parlay)\b/gi,
      /\b(online casino|gambling site|betting app)\b/gi,
    ],
  },
  {
    category: "drugs",
    severity: "block",
    patterns: [
      /\b(buy (pills?|oxycodone|xanax|adderall|tramadol|fentanyl|heroin|meth|cocaine|ecstasy|mdma))\b/gi,
      /\b(prescription (without|no) (rx|prescription)|pill mill)\b/gi,
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
          allowed: group.severity === "flag", // flag = allowed but warned; block = not allowed
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
