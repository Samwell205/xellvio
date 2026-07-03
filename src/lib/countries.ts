// ISO 3166-1 alpha-2 country codes with E.164 dial codes.
export interface Country {
  iso: string; // ISO 3166-1 alpha-2
  name: string;
  dial: string; // E.164 dial code prefixed with "+"
}

// Countries where carriers require alphanumeric sender IDs to be pre-registered
// with the local operator. Sending an unregistered alpha SID (e.g. "SAMWELL")
// to these destinations gets rejected by Telnyx with a 400 "not registered"
// error, so we surface them as "Requires registration" in the UI and skip them
// at send time. US / CA have their own toll-free flow and are handled separately.
export const ALPHA_SENDER_REQUIRES_REGISTRATION: readonly string[] = [
  "NG", "IN", "CN", "SA", "AE", "QA", "KW", "BH", "OM", "EG", "TR",
  "PH", "VN", "TH", "ID", "MY", "BD", "PK", "LK", "MA", "DZ", "TN",
];
export const ALPHA_SENDER_REQUIRES_REGISTRATION_SET = new Set(ALPHA_SENDER_REQUIRES_REGISTRATION);

export const COUNTRIES: Country[] = [
  { iso: "US", name: "United States", dial: "+1" },
  { iso: "CA", name: "Canada", dial: "+1" },
  { iso: "GB", name: "United Kingdom", dial: "+44" },
  { iso: "IE", name: "Ireland", dial: "+353" },
  { iso: "AU", name: "Australia", dial: "+61" },
  { iso: "NZ", name: "New Zealand", dial: "+64" },
  { iso: "DE", name: "Germany", dial: "+49" },
  { iso: "FR", name: "France", dial: "+33" },
  { iso: "ES", name: "Spain", dial: "+34" },
  { iso: "IT", name: "Italy", dial: "+39" },
  { iso: "PT", name: "Portugal", dial: "+351" },
  { iso: "NL", name: "Netherlands", dial: "+31" },
  { iso: "BE", name: "Belgium", dial: "+32" },
  { iso: "LU", name: "Luxembourg", dial: "+352" },
  { iso: "CH", name: "Switzerland", dial: "+41" },
  { iso: "AT", name: "Austria", dial: "+43" },
  { iso: "DK", name: "Denmark", dial: "+45" },
  { iso: "SE", name: "Sweden", dial: "+46" },
  { iso: "NO", name: "Norway", dial: "+47" },
  { iso: "FI", name: "Finland", dial: "+358" },
  { iso: "IS", name: "Iceland", dial: "+354" },
  { iso: "PL", name: "Poland", dial: "+48" },
  { iso: "CZ", name: "Czechia", dial: "+420" },
  { iso: "SK", name: "Slovakia", dial: "+421" },
  { iso: "HU", name: "Hungary", dial: "+36" },
  { iso: "RO", name: "Romania", dial: "+40" },
  { iso: "BG", name: "Bulgaria", dial: "+359" },
  { iso: "GR", name: "Greece", dial: "+30" },
  { iso: "HR", name: "Croatia", dial: "+385" },
  { iso: "SI", name: "Slovenia", dial: "+386" },
  { iso: "EE", name: "Estonia", dial: "+372" },
  { iso: "LV", name: "Latvia", dial: "+371" },
  { iso: "LT", name: "Lithuania", dial: "+370" },
  { iso: "MT", name: "Malta", dial: "+356" },
  { iso: "CY", name: "Cyprus", dial: "+357" },
  { iso: "TR", name: "Turkey", dial: "+90" },
  { iso: "RU", name: "Russia", dial: "+7" },
  { iso: "UA", name: "Ukraine", dial: "+380" },
  { iso: "IL", name: "Israel", dial: "+972" },
  { iso: "AE", name: "United Arab Emirates", dial: "+971" },
  { iso: "SA", name: "Saudi Arabia", dial: "+966" },
  { iso: "QA", name: "Qatar", dial: "+974" },
  { iso: "KW", name: "Kuwait", dial: "+965" },
  { iso: "BH", name: "Bahrain", dial: "+973" },
  { iso: "OM", name: "Oman", dial: "+968" },
  { iso: "JO", name: "Jordan", dial: "+962" },
  { iso: "LB", name: "Lebanon", dial: "+961" },
  { iso: "EG", name: "Egypt", dial: "+20" },
  { iso: "MA", name: "Morocco", dial: "+212" },
  { iso: "DZ", name: "Algeria", dial: "+213" },
  { iso: "TN", name: "Tunisia", dial: "+216" },
  { iso: "ZA", name: "South Africa", dial: "+27" },
  { iso: "NG", name: "Nigeria", dial: "+234" },
  { iso: "GH", name: "Ghana", dial: "+233" },
  { iso: "KE", name: "Kenya", dial: "+254" },
  { iso: "UG", name: "Uganda", dial: "+256" },
  { iso: "TZ", name: "Tanzania", dial: "+255" },
  { iso: "RW", name: "Rwanda", dial: "+250" },
  { iso: "ET", name: "Ethiopia", dial: "+251" },
  { iso: "CI", name: "Côte d'Ivoire", dial: "+225" },
  { iso: "SN", name: "Senegal", dial: "+221" },
  { iso: "CM", name: "Cameroon", dial: "+237" },
  { iso: "IN", name: "India", dial: "+91" },
  { iso: "PK", name: "Pakistan", dial: "+92" },
  { iso: "BD", name: "Bangladesh", dial: "+880" },
  { iso: "LK", name: "Sri Lanka", dial: "+94" },
  { iso: "NP", name: "Nepal", dial: "+977" },
  { iso: "CN", name: "China", dial: "+86" },
  { iso: "HK", name: "Hong Kong", dial: "+852" },
  { iso: "TW", name: "Taiwan", dial: "+886" },
  { iso: "JP", name: "Japan", dial: "+81" },
  { iso: "KR", name: "South Korea", dial: "+82" },
  { iso: "SG", name: "Singapore", dial: "+65" },
  { iso: "MY", name: "Malaysia", dial: "+60" },
  { iso: "TH", name: "Thailand", dial: "+66" },
  { iso: "VN", name: "Vietnam", dial: "+84" },
  { iso: "PH", name: "Philippines", dial: "+63" },
  { iso: "ID", name: "Indonesia", dial: "+62" },
  { iso: "MX", name: "Mexico", dial: "+52" },
  { iso: "BR", name: "Brazil", dial: "+55" },
  { iso: "AR", name: "Argentina", dial: "+54" },
  { iso: "CL", name: "Chile", dial: "+56" },
  { iso: "CO", name: "Colombia", dial: "+57" },
  { iso: "PE", name: "Peru", dial: "+51" },
  { iso: "VE", name: "Venezuela", dial: "+58" },
  { iso: "UY", name: "Uruguay", dial: "+598" },
  { iso: "PY", name: "Paraguay", dial: "+595" },
  { iso: "BO", name: "Bolivia", dial: "+591" },
  { iso: "EC", name: "Ecuador", dial: "+593" },
  { iso: "CR", name: "Costa Rica", dial: "+506" },
  { iso: "PA", name: "Panama", dial: "+507" },
  { iso: "DO", name: "Dominican Republic", dial: "+1" },
  { iso: "JM", name: "Jamaica", dial: "+1" },
  { iso: "TT", name: "Trinidad and Tobago", dial: "+1" },
];

export const COUNTRY_BY_ISO: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.iso, c]),
);

// Map a dial code to a primary ISO country. For shared codes like +1
// (US/CA/Caribbean), this returns the most common business case (US).
export function isoFromDial(dial: string): string | undefined {
  const normalized = dial.trim().startsWith("+") ? dial.trim() : `+${dial.trim()}`;
  const preferred: Record<string, string> = { "+1": "US", "+44": "GB", "+7": "RU" };
  if (preferred[normalized]) return preferred[normalized];
  const match = COUNTRIES.find((c) => c.dial === normalized);
  return match?.iso;
}
