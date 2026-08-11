// Supported NOWPayments pay currencies (ticker -> label).
// Keep client picker and server validation in sync via this single list.
export const CRYPTO_COINS = [
  { value: "usdttrc20", label: "USDT (TRC20)" },
  { value: "usdterc20", label: "USDT (ERC20)" },
  { value: "usdtbsc", label: "USDT (BSC)" },
  { value: "usdtsol", label: "USDT (Solana)" },
  { value: "usdtmatic", label: "USDT (Polygon)" },
  { value: "usdcbsc", label: "USDC (BSC)" },
  { value: "usdc", label: "USDC (ERC20)" },
  { value: "usdcsol", label: "USDC (Solana)" },
  { value: "usdcmatic", label: "USDC (Polygon)" },
  { value: "sol", label: "Solana (SOL)" },
  { value: "btc", label: "Bitcoin (BTC)" },
  { value: "eth", label: "Ethereum (ETH)" },
  { value: "ethbase", label: "Ethereum (Base)" },
  { value: "bnbbsc", label: "BNB (BSC)" },
  { value: "trx", label: "TRON (TRX)" },
  { value: "ltc", label: "Litecoin (LTC)" },
  { value: "xrp", label: "XRP" },
  { value: "doge", label: "Dogecoin (DOGE)" },
  { value: "ada", label: "Cardano (ADA)" },
  { value: "matic", label: "Polygon (POL)" },
  { value: "avax", label: "Avalanche (AVAX)" },
  { value: "ton", label: "Toncoin (TON)" },
  { value: "dai", label: "DAI (ERC20)" },
  { value: "bch", label: "Bitcoin Cash (BCH)" },
  { value: "dot", label: "Polkadot (DOT)" },
  { value: "xlm", label: "Stellar (XLM)" },
  { value: "shib", label: "Shiba Inu (SHIB)" },
  { value: "link", label: "Chainlink (LINK)" },
] as const;

export const CRYPTO_COIN_VALUES: string[] = CRYPTO_COINS.map((c) => c.value);

export const DEFAULT_CRYPTO_COIN = "usdttrc20";

export function isSupportedCoin(coin: string): boolean {
  return CRYPTO_COIN_VALUES.includes(coin);
}
