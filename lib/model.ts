// The SOONAIR model's one job: turn the sealed DefiLlama snapshot into a ranked board of protocols
// that record no token yet, each with the value a token would carry if it were priced the way the
// snapshot's own launched protocols are priced, and a farm plan a reader can act on.
//
// THE SCORING LAYER (the dashboard's second set of figures, computed into data.js only — board.json
// never carries them): SOONAIR also estimates, per protocol, how airdrop-ready it looks, from the
// snapshot's record alone. The airdrop likelihood (0..100) is five published parts: the category's
// launch propensity — the share of the category's snapshot protocols that already record a token,
// shrunk toward the global share — worth 40; a log TVL band worth 25; track record worth 15; 7-day
// momentum worth 10; chain breadth worth 10. Around it sit three stated classifications, never
// measurements: a snapshot-window state from the protocol's age (under a year: window likely open;
// under three: uncertain; older: snapshot risk, likely taken; no date on record: uncertain), an
// entry cost class read off the farm plan itself (account-flavoured families are Free; a plan whose
// core step locks $150 or more of position is Capital; anything smaller is Low $), and a difficulty
// tier from plan length, cost class and chain count. Every weight and threshold is a constant below
// and is printed on the dashboard's model view, so any figure can be re-derived by hand.
//
// THE MODEL (every number below is computed from the snapshot itself; no protocol name is ever
// special-cased and no figure is typed in by hand except the stated constants):
//
//   implied_value = TVL x R(category) x G(growth) x M(track record) x B(breadth)
//
//   R(category)  The comparable multiple. Every launched protocol in the snapshot that carries a
//                market cap gives one observation of FDV/TVL = mcap_usd / tvl_usd. Observations are
//                winsorized to [0.01, 4] first: past that band the ratio in this snapshot is an
//                artifact (a holding-company market cap over a sliver of TVL, a near-zero TVL
//                denominator), not a price the market pays for a protocol business. The category's
//                multiple is the median of its observations, shrunk toward the global median in
//                log space with a prior strength of 5 observations, so a category with one loud
//                comparable borrows most of its multiple from the whole market and a category with
//                fifteen comps mostly speaks for itself. The result is clamped to [0.02, 2.5].
//   G(growth)    Momentum: 1 + clamp(change_7d, -45, 80) / 100 x 0.55, floored at 0.60. A protocol
//                gathering TVL into a launch is worth more than the same TVL draining away; a
//                missing change_7d counts as 0, no momentum either way.
//   M(record)    Track record: 0.80 + 0.40 x (1 - exp(-age_days / 500)). A protocol that has run
//                for years with no token has a proven product a launch can price; a three-week-old
//                one is discounted, not zeroed. An unrecorded listing date counts as 200 days.
//   B(breadth)   Distribution: 1 + 0.025 x min(chains - 1, 6). Each extra chain a protocol already
//                serves is distribution a token launches into, worth a little, capped at +15%.
//
// WHO IS RANKED. The watchlist is the floor: all 40 of its slugs are always on the board. Around
// it, the radar applies the watchlist's own product test at every size, above the floor as well as
// below it (the snapshot's parent-protocol record, which this file does not carry, keeps some
// large protocols off the list; the test below is the part of the rule the snapshot can check): a protocol is
// ranked when it records no token (no market cap, no CoinGecko id, no symbol) and is not a wrapped,
// staked or bridged product of a token that already trades (category Bridge, Canonical Bridge,
// Liquid Staking, Liquid Restaking or Restaked BTC, a name carrying the whole word wrapped, staked
// or staking, a name beginning with an exchange's name), not an exchange itself (category CEX) and
// not a versioned pool of another protocol (a name ending in V2, 2.0 and the like). Protocols whose
// token already trades are never ranked: they are set aside and shown at their market's own value.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's stated constants: the dashboard prints them and the README derives them. */
export interface ModelConstants {
  /** Each comparable's FDV/TVL is clamped into this band before any median is taken. */
  ratio_winsor_low: number;
  ratio_winsor_high: number;
  /** Log-space prior strength, in observations, pulling a category median toward the global one. */
  ratio_prior_strength: number;
  /** The final category multiple is clamped into this band. */
  ratio_floor: number;
  ratio_cap: number;
  growth_floor_pct: number;
  growth_cap_pct: number;
  growth_weight: number;
  growth_min_factor: number;
  maturity_base: number;
  maturity_range: number;
  maturity_tau_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  ratio_winsor_low: 0.01,
  ratio_winsor_high: 4,
  ratio_prior_strength: 5,
  ratio_floor: 0.02,
  ratio_cap: 2.5,
  growth_floor_pct: -45,
  growth_cap_pct: 80,
  growth_weight: 0.55,
  growth_min_factor: 0.6,
  maturity_base: 0.8,
  maturity_range: 0.4,
  maturity_tau_days: 500,
  unknown_age_days: 200,
  breadth_per_chain: 0.025,
  breadth_max_chains: 6,
};

/** The model's version label: the dashboard names it and the README quotes it. */
export const MODEL_VERSION = 'soonair-1';

/** The airdrop scoring layer's stated constants: the dashboard prints them beside the figures. */
export interface ScoreConstants {
  /** Points for the category's launch propensity, and the shrinkage prior behind that share. */
  prop_weight: number;
  prop_prior: number;
  /** Points for the TVL band: a log ramp from tvl_floor_usd (no points) to tvl_full_usd (full). */
  tvl_weight: number;
  tvl_floor_usd: number;
  tvl_full_usd: number;
  /** Points for track record: age_weight x (1 - exp(-age / age_tau_days)); unknown age counts as unknown_age_days. */
  age_weight: number;
  age_tau_days: number;
  unknown_age_days: number;
  /** Points for momentum: change_7d mapped linearly from momentum_floor_pct (0) over momentum_span_pct points (full). */
  momentum_weight: number;
  momentum_floor_pct: number;
  momentum_span_pct: number;
  /** Points for breadth: full at breadth_full_chains chains. */
  breadth_weight: number;
  breadth_full_chains: number;
  /** Snapshot-window thresholds in days of age: open below the first, at risk from the second. */
  window_open_days: number;
  window_risk_days: number;
}

export const SCORE: ScoreConstants = {
  prop_weight: 40,
  prop_prior: 5,
  tvl_weight: 25,
  tvl_floor_usd: 5_000_000,
  tvl_full_usd: 2_000_000_000,
  age_weight: 15,
  age_tau_days: 400,
  unknown_age_days: 200,
  momentum_weight: 10,
  momentum_floor_pct: -20,
  momentum_span_pct: 60,
  breadth_weight: 10,
  breadth_full_chains: 6,
  window_open_days: 365,
  window_risk_days: 1095,
};

/** How many rows beyond the watchlist's 40 the radar adds, largest TVL first. */
export const EARLY_ROWS = 180;

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json: the ranked board's row. Extra keys beyond the gate's five are the model's workings. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    comp_ratio: number;
    comp_count: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: the board row's figures, its workings and its plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  /** This row's place in the field: the share of ranked rows below it, 0..100. Filled by buildRadar. */
  tvl_pct: number;
  value_pct: number;
  /** SOONAIR's airdrop likelihood estimate, 0..100, and its five parts in SCORE order
   * (propensity, TVL band, track record, momentum, breadth), each rounded to a tenth.
   * Filled by buildRadar; the parts sum to the score, give or take the final rounding. */
  air: number;
  ap: [number, number, number, number, number];
  /** Snapshot-window estimate: 0 window likely open, 1 uncertain, 2 snapshot risk. */
  win: 0 | 1 | 2;
  /** Entry cost class read off the farm plan: 0 Free, 1 Low $, 2 Capital. */
  cost: 0 | 1 | 2;
  /** Difficulty tier from plan length, cost class and chain count: 0 Easy, 1 Medium, 2 Hard. */
  diff: 0 | 1 | 2;
  /** The median implied multiple of this row's category across the board; null when it cannot be formed. */
  cat_median_mult: number | null;
  comp_ratio: number;
  comp_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** One category's comparable set, as the dashboard's model panel states it. */
export interface CompStat {
  category: string;
  comps: number;
  ratio: number;
}

/** The board's vital signs, from the ranked rows alone: size, momentum and freshness. */
export interface PulseData {
  total_tvl_usd: number;
  median_change_7d: number | null;
  reported: number;
  gainers: number;
  losers: number;
}

/** One of the board's most recently tracked protocols: the freshest listings the snapshot records. */
export interface NewListing {
  slug: string;
  name: string;
  listed_at: string;
  category: string | null;
  tvl_usd: number;
  implied_value_usd: number;
  watchlist: boolean;
}

/** One category's weight across the ranked set: headcount, aggregate TVL, median implied multiple. */
export interface CategoryStat {
  category: string;
  count: number;
  tvl_usd: number;
  median_multiple: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  /** The scoring layer's constants, and the snapshot's own launch record behind the propensity part:
   * launched_count of snapshot_count protocols already record a token, a share of launch_share. */
  score: ScoreConstants;
  launched_count: number;
  snapshot_count: number;
  launch_share: number;
  global_comp_ratio: number;
  global_comp_count: number;
  comp_stats: CompStat[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  live_total: number;
  pulse: PulseData;
  newest: NewListing[];
  categories: CategoryStat[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The median of a set of figures, or null when the set is empty. */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Where a figure stands in its field: the share of the field strictly below it, 0..100. */
function pctBelow(sortedAsc: number[], v: number): number {
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return sortedAsc.length <= 1 ? 100 : Math.round((lo / (sortedAsc.length - 1)) * 100);
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking, in any case: a product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Names that begin with an exchange's name are that exchange's own product. */
const EXCHANGE_HEADS = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol is a product of a token that already trades, by the watchlist's own test. */
export function isProductOfLiveToken(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  return EXCHANGE_HEADS.some((head) => p.name === head || p.name.startsWith(`${head} `));
}

/** Whether a protocol is one the board may rank: pre-token, not a product of a live token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) && !isProductOfLiveToken(p);
}

// ---------------------------------------------------------------- the comparables

/** The comparable set the model prices from: every launched protocol's winsorized FDV/TVL, by category and overall. */
export interface CompSet {
  globalRatio: number;
  globalCount: number;
  byCategory: Map<string, { ratio: number; count: number }>;
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Build the comparable set from the snapshot's launched protocols (those carrying a market cap). */
export function buildComps(snapshot: Snapshot, model: ModelConstants = MODEL): CompSet {
  const all: number[] = [];
  const perCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = clamp(p.mcap_usd / p.tvl_usd, model.ratio_winsor_low, model.ratio_winsor_high);
    all.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = perCategory.get(key);
    if (list === undefined) perCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const globalRatio = all.length > 0 ? median(all) : 0.17;
  const byCategory = new Map<string, { ratio: number; count: number }>();
  for (const [category, ratios] of perCategory) {
    const n = ratios.length;
    // Log-space shrinkage: the category median pulled toward the global median by a prior of
    // `ratio_prior_strength` phantom observations, so thin categories borrow the market's multiple.
    const shrunk = Math.exp((n * Math.log(median(ratios)) + model.ratio_prior_strength * Math.log(globalRatio)) / (n + model.ratio_prior_strength));
    byCategory.set(category, { ratio: clamp(shrunk, model.ratio_floor, model.ratio_cap), count: n });
  }
  return { globalRatio, globalCount: all.length, byCategory };
}

/** The multiple one category prices at, and how many comparables stand behind it. */
export function compFor(comps: CompSet, category: string | null): { ratio: number; count: number } {
  const hit = comps.byCategory.get(category ?? 'Uncategorized');
  return hit === undefined ? { ratio: comps.globalRatio, count: comps.globalCount } : hit;
}

// ---------------------------------------------------------------- the score

/** One protocol's four factors and its implied value under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: CompSet,
  model: ModelConstants = MODEL,
): { implied: number; compRatio: number; compCount: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const comp = compFor(comps, protocol.category);
  const growthPct = clamp(protocol.change_7d ?? 0, model.growth_floor_pct, model.growth_cap_pct);
  const growthMult = Math.max(model.growth_min_factor, 1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_base + model.maturity_range * (1 - Math.exp(-Math.max(ageForModel, 0) / model.maturity_tau_days));
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const implied = clamp(Math.round(protocol.tvl_usd * comp.ratio * growthMult * maturityMult * breadthMult), 1, 1_000_000_000_000);
  return { implied, compRatio: comp.ratio, compCount: comp.count, growthMult, maturityMult, breadthMult, age };
}

// ---------------------------------------------------------------- farm plans

/** The gas asset a chain's fees are paid in, for the chains this snapshot mostly names. */
const GAS_ASSET: Record<string, string> = {
  Ethereum: 'ETH', Base: 'ETH', Arbitrum: 'ETH', Optimism: 'ETH', 'OP Mainnet': 'ETH', Linea: 'ETH',
  Scroll: 'ETH', 'zkSync Era': 'ETH', Mantle: 'MNT', Blast: 'ETH', Taiko: 'ETH', Unichain: 'ETH',
  Binance: 'BNB', 'BNB Chain': 'BNB', Solana: 'SOL', Avalanche: 'AVAX', Polygon: 'POL', Tron: 'TRX',
  'Hyperliquid L1': 'HYPE', Monad: 'MON', Bitcoin: 'BTC', Sui: 'SUI', Aptos: 'APT', Sonic: 'S',
  Berachain: 'BERA', Sei: 'SEI', Near: 'NEAR', Starknet: 'STRK', Fraxtal: 'ETH', Mode: 'ETH',
};

/** The chain a protocol's farm starts on: its first chain, where DefiLlama counts its largest presence first. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function gasOf(chain: string): string {
  return GAS_ASSET[chain] ?? 'the chain’s native gas token';
}

/** How much capital one farm position carries, from TVL alone: deeper protocols absorb more. */
function capitalForTvl(tvl: number): number {
  if (tvl >= 1_000_000_000) return 500;
  if (tvl >= 250_000_000) return 250;
  if (tvl >= 50_000_000) return 150;
  if (tvl >= 10_000_000) return 75;
  return 40;
}

/** How much capital one farm position carries, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  return capitalForTvl(p.tvl_usd);
}

/** How long to hold, from the protocol's age: younger protocols need a longer window to span weekly snapshots. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 90) return 75;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

type Family = 'credit' | 'exchange' | 'derivatives' | 'curator' | 'yield' | 'staking' | 'rwa' | 'chain' | 'stable' | 'prediction' | 'insurance' | 'payments' | 'privacy' | 'other';

const FAMILY_OF: Record<string, Family> = {
  Lending: 'credit', CDP: 'credit', 'CDP Manager': 'credit', 'Uncollateralized Lending': 'credit',
  'Collateral Markets': 'credit', 'Collateral Management': 'credit',
  Dexs: 'exchange',
  Derivatives: 'derivatives', 'Interest Rate Derivatives': 'derivatives', Options: 'derivatives', 'Options Vault': 'derivatives',
  'Risk Curators': 'curator', 'Onchain Capital Allocator': 'curator', 'Liquidity Manager': 'curator',
  Yield: 'yield', 'Yield Aggregator': 'yield', Farm: 'yield', 'Leveraged Farming': 'yield', 'Basis Trading': 'yield',
  Restaking: 'staking', 'Staking Pool': 'staking',
  RWA: 'rwa', Indexes: 'rwa',
  Chain: 'chain',
  'Dual-Token Stablecoin': 'stable', 'Stablecoin Wrapper': 'stable', 'Algo-Stables': 'stable',
  'Prediction Market': 'prediction',
  Insurance: 'insurance',
  Payments: 'payments', 'Crypto Card Issuer': 'payments',
  Privacy: 'privacy',
};

function familyOfCategory(category: string | null): Family {
  return (category !== null ? FAMILY_OF[category] : undefined) ?? 'other';
}

function familyOf(p: SnapshotProtocol): Family {
  return familyOfCategory(p.category);
}

/** The family's core position: the one action that makes a wallet a real user of this protocol. */
function coreAction(family: Family, name: string, chain: string, capital: number): string {
  switch (family) {
    case 'credit': return `Supply $${capital} of USDC to ${name} on ${chain} as collateral and leave the deposit in place`;
    case 'exchange': return `Swap $${capital} of USDC through ${name} on ${chain}, then leave $${capital} in its main liquidity pool`;
    case 'derivatives': return `Deposit $${capital} of USDC as margin on ${name} and open one small position you can hold overnight`;
    case 'curator': return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares in the wallet`;
    case 'yield': return `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the receipt token`;
    case 'staking': return `Stake $${capital} of ${chain}'s staking asset through ${name} and keep the staking receipt in the wallet`;
    case 'rwa': return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the wallet`;
    case 'chain': return `Bridge $${capital} of USDC to ${chain} and hold it there as a native balance of the network`;
    case 'stable': return `Mint $${capital} of ${name}'s stablecoin against collateral on ${chain} and hold the stablecoin`;
    case 'prediction': return `Fund the wallet with $${capital} and take one position on a liquid market on ${name}`;
    case 'insurance': return `Buy $${capital} of cover on a listed protocol from ${name} and keep the policy to expiry`;
    case 'payments': return `Load $${capital} onto the ${name} account or card and make one real payment with it`;
    case 'privacy': return `Deposit $${capital} of USDC into ${name}'s shielded pool on ${chain} and keep the note unspent`;
    default: return `Deposit $${capital} of USDC into ${name} on ${chain} through its main product and keep the position open`;
  }
}

/** The family's second interaction: the follow-up that separates a user from a one-click wallet. */
function depthAction(family: Family, name: string, chain: string, capital: number): string {
  const half = Math.max(25, Math.round(capital / 2));
  switch (family) {
    case 'credit': return `Open a small borrow of about $${half} against the supply, repay it after a week, and borrow once more so the wallet shows both sides of the market`;
    case 'exchange': return `Route two more swaps of about $${half} each through ${name} on different days, one of them through its limit or advanced route if it offers one`;
    case 'derivatives': return `Add about $${half} to the margin account and close the first position only after it has been open across a weekly snapshot`;
    case 'curator': return `Move about $${half} into a second ${name} vault with a different risk profile, so the wallet holds two curated positions, not one`;
    case 'yield': return `Claim any accrued yield once and restake it in the same vault instead of withdrawing, so the position compounds on the record`;
    case 'staking': return `Delegate or restake a further $${half} to a second operator or vault inside ${name}, keeping both receipts`;
    case 'rwa': return `Redeem a small $${half} slice once and mint it back a week later, so the wallet shows a full round trip, not only a buy`;
    case 'chain': return `Pay one real fee on ${chain}: swap or transfer inside a native app so the wallet has organic activity beyond the bridge in`;
    case 'stable': return `Use $${half} of the minted stablecoin in a listed pool or payment inside the app, then top the collateral back up`;
    case 'prediction': return `Settle the first market to completion and take a position in a second market in a different category on ${name}`;
    case 'insurance': return `Renew or extend the cover once before it lapses, so the wallet carries an unbroken insured period`;
    case 'payments': return `Make two further small payments on different days and keep the account funded between them`;
    case 'privacy': return `Make one shielded transfer of about $${half} to a second wallet you control and keep both notes unspent`;
    default: return `Repeat the core action once with about $${half} on a later day, so the wallet's history is a pattern of use, not a single visit`;
  }
}

/** One step as one string: the action, then its cost and its time, inside the gate's 20..600 characters. */
function stepText(action: string, cost: string, time: string): string {
  let s = `${action}. Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and re-check it weekly.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps derived from its own record — its category family decides the
 * actions, its first chain names the gas asset, its TVL sizes the capital, its age sets the hold,
 * and its seven-day change sets the sizing note. No name is special-cased.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const gas = gasOf(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const family = familyOf(p);
  const change = p.change_7d;
  const sizing = change === null
    ? `its TVL was flat on the week in the snapshot, so start at the standard size`
    : change <= -15
      ? `its TVL fell ${Math.abs(change).toFixed(1)}% in the snapshot's week, so halve the first position and add the rest only if TVL stabilises`
      : change >= 15
        ? `its TVL grew ${change.toFixed(1)}% in the snapshot's week, so the standard size is fine but do not chase a larger one`
        : `its TVL moved ${change >= 0 ? '+' : ''}${change.toFixed(1)}% in the snapshot's week, so the standard size fits`;
  return [
    stepText(
      `Create a fresh wallet for this farm alone, fund it on ${chain} with the position capital plus about $10 of ${gas} for gas, and keep its seed phrase offline`,
      `about $10 of ${gas} held for gas, no purchase needed`,
      '10 minutes',
    ),
    stepText(coreAction(family, p.name, chain, capital), `$${capital} of capital and roughly $2–6 of gas on ${chain}`, '15 minutes to set up'),
    stepText(depthAction(family, p.name, chain, capital), `about $${Math.max(25, Math.round(capital / 2))} more capital and $2–4 of gas`, '15 minutes, a week after step 2'),
    stepText(
      `Return once a week for one qualifying action — a deposit top-up, a swap, a claim or a vote — and size it by the trend: ${sizing}`,
      'about $1–3 of gas a week',
      '10 minutes a week',
    ),
    stepText(
      `Hold the position for at least ${hold} days so the activity appears in several weekly snapshots rather than a single one`,
      `the $${capital} stays in the position for the whole window`,
      `${hold} days`,
    ),
    stepText(
      `Check ${p.name}'s own site and channels for a points or rewards page, claim only through links the protocol itself publishes, and never pay a fee or sign a blind approval to claim`,
      'nothing to check; a claim that asks for payment is a scam',
      '10 minutes',
    ),
    stepText(
      `Keep a farm log — wallet, dates, amounts, transaction hashes — and re-check the position monthly; unwind it if the protocol ships a token with no allocation for users like yours, or if its TVL halves from here`,
      'nothing but the log',
      '5 minutes a month',
    ),
  ];
}

// ---------------------------------------------------------------- the airdrop scoring layer

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The snapshot's launch record: how many of its protocols already record a token, overall and,
 * per category, each category's share shrunk toward the global share by SCORE.prop_prior phantom
 * protocols — the same shrinkage the price model gives a thin comparable set. */
export interface LaunchStats {
  launched: number;
  total: number;
  share: number;
  byCategory: Map<string, number>;
}

export function launchStats(snapshot: Snapshot): LaunchStats {
  let launched = 0;
  const counts = new Map<string, { n: number; l: number }>();
  for (const p of snapshot.protocols) {
    const live = !isPreToken(p);
    if (live) launched++;
    const key = p.category ?? 'Uncategorized';
    const g = counts.get(key) ?? { n: 0, l: 0 };
    g.n++;
    if (live) g.l++;
    counts.set(key, g);
  }
  const total = snapshot.protocols.length;
  const share = total > 0 ? launched / total : 0;
  const byCategory = new Map<string, number>();
  for (const [key, g] of counts) {
    byCategory.set(key, (g.l + SCORE.prop_prior * share) / (g.n + SCORE.prop_prior));
  }
  return { launched, total, share, byCategory };
}

/** One protocol's airdrop likelihood: five stated parts, each a published fraction of its weight. */
export function airdropScore(
  row: { category: string | null; tvl_usd: number; change_7d: number | null; age_days: number | null; chains: string[] },
  propensity: number,
): { score: number; parts: [number, number, number, number, number] } {
  const tvlRamp = clamp(
    (Math.log10(Math.max(row.tvl_usd, 1)) - Math.log10(SCORE.tvl_floor_usd)) /
      (Math.log10(SCORE.tvl_full_usd) - Math.log10(SCORE.tvl_floor_usd)),
    0,
    1,
  );
  const age = row.age_days ?? SCORE.unknown_age_days;
  const parts: [number, number, number, number, number] = [
    round1(SCORE.prop_weight * propensity),
    round1(SCORE.tvl_weight * tvlRamp),
    round1(SCORE.age_weight * (1 - Math.exp(-Math.max(age, 0) / SCORE.age_tau_days))),
    round1(SCORE.momentum_weight * clamp(((row.change_7d ?? 0) - SCORE.momentum_floor_pct) / SCORE.momentum_span_pct, 0, 1)),
    round1((SCORE.breadth_weight * Math.min(row.chains.length, SCORE.breadth_full_chains)) / SCORE.breadth_full_chains),
  ];
  const score = clamp(Math.round(parts[0] + parts[1] + parts[2] + parts[3] + parts[4]), 0, 100);
  return { score, parts };
}

/** The snapshot-window estimate, from age alone: a young protocol's user snapshot is probably
 * still to come; an old, established one's was probably taken long ago. No date on record
 * cannot be aged, so it sits in the uncertain middle. */
export function windowState(age: number | null): 0 | 1 | 2 {
  if (age === null) return 1;
  if (age < SCORE.window_open_days) return 0;
  if (age < SCORE.window_risk_days) return 1;
  return 2;
}

/** Words in a plan's core step that commit a position rather than work a balance. */
const LOCK_WORDS = /supply|deposit|stake|mint|margin|collateral|liquidity pool/i;
/** Families whose product is a locked position when the money is large enough. */
const CAPITAL_FAMILIES: ReadonlySet<Family> = new Set(['credit', 'staking', 'curator', 'yield', 'stable', 'rwa', 'privacy', 'derivatives']);

/** The entry cost class, read off the protocol's own farm plan: the account-flavoured payments
 * family joins with a signup and locks nothing, so it is Free; a core step that locks a position
 * of $150 or more is Capital; everything else works a smaller balance and is Low $. */
export function costClass(row: { category: string | null; tvl_usd: number; farm_steps: string[] }): 0 | 1 | 2 {
  const family = familyOfCategory(row.category);
  if (family === 'payments') return 0;
  const capital = capitalForTvl(row.tvl_usd);
  if (LOCK_WORDS.test(row.farm_steps[1] ?? '')) return capital >= 150 ? 2 : 1;
  if (CAPITAL_FAMILIES.has(family) && capital >= 250) return 2;
  return 1;
}

/** The difficulty tier: one point for a full-length plan, the cost class itself (Free 0, Low $ 1,
 * Capital 2), one point for a protocol spread over five or more chains. 0–2 Easy, 3 Medium, 4 Hard. */
export function difficultyTier(stepCount: number, cost: 0 | 1 | 2, chainCount: number): 0 | 1 | 2 {
  const points = (stepCount >= 6 ? 1 : 0) + cost + (chainCount >= 5 ? 1 : 0);
  return points <= 2 ? 0 : points === 3 ? 1 : 2;
}

// ---------------------------------------------------------------- the board

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, comps: CompSet, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The radar beyond the list: every rankable pre-token protocol the product test passes, at any
  // size, largest first, capped. The watchlist's 40 are already chosen and never displaced by these.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, comps, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watch.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      comp_ratio: round4(s.v.compRatio),
      comp_count: s.v.compCount,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live view: the market's own values, set aside. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

/** A board row's form for data.js: everything the page renders, plan included. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    // Field positions are a property of the whole board, not of one row: buildRadar fills them.
    tvl_pct: 0,
    value_pct: 0,
    // The scoring layer's figures are likewise a property of the whole snapshot: buildRadar fills them.
    air: 0,
    ap: [0, 0, 0, 0, 0],
    win: 1,
    cost: 1,
    diff: 1,
    cat_median_mult: null,
    comp_ratio: row.model.comp_ratio,
    comp_count: row.model.comp_count,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const comps = buildComps(snapshot, model);
  const board = buildBoard(snapshot, comps, model);
  const live = liveRows(snapshot);
  const liveTotal = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const compStats: CompStat[] = [...comps.byCategory.entries()]
    .map(([category, v]) => ({ category, comps: v.count, ratio: round4(v.ratio) }))
    .sort((a, b) => b.comps - a.comps || (a.category < b.category ? -1 : 1));
  // The graphics' data, all of it aggregates of the board's own figures: nothing here feeds
  // back into the board, so board.json keeps the bytes it has always had.
  const rows = board.map(radarRow);
  const tvlsAsc = board.map((r) => r.tvl_usd).sort((a, b) => a - b);
  const valuesAsc = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const catGroups = new Map<string, { count: number; tvl: number; mults: number[] }>();
  for (const r of board) {
    const key = r.category ?? 'Uncategorized';
    const g = catGroups.get(key) ?? { count: 0, tvl: 0, mults: [] };
    g.count += 1;
    g.tvl += r.tvl_usd;
    if (r.tvl_usd > 0) g.mults.push(r.implied_value_usd / r.tvl_usd);
    catGroups.set(key, g);
  }
  const catMedian = new Map<string, number | null>();
  const categories: CategoryStat[] = [...catGroups.entries()]
    .map(([category, g]) => {
      const med = medianOf(g.mults);
      const rounded = med === null ? null : round4(med);
      catMedian.set(category, rounded);
      return { category, count: g.count, tvl_usd: g.tvl, median_multiple: rounded };
    })
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.category < b.category ? -1 : 1));
  const launch = launchStats(snapshot);
  rows.forEach((r, i) => {
    const b = board[i]!;
    r.tvl_pct = pctBelow(tvlsAsc, b.tvl_usd);
    r.value_pct = pctBelow(valuesAsc, b.implied_value_usd);
    r.cat_median_mult = catMedian.get(b.category ?? 'Uncategorized') ?? null;
    const s = airdropScore(b, launch.byCategory.get(b.category ?? 'Uncategorized') ?? launch.share);
    r.air = s.score;
    r.ap = s.parts;
    r.win = windowState(b.age_days);
    r.cost = costClass(b);
    r.diff = difficultyTier(b.farm_steps.length, r.cost, b.chains.length);
  });
  const changes = board.map((r) => r.change_7d).filter((c): c is number => c !== null);
  const medChange = medianOf(changes);
  const pulse: PulseData = {
    total_tvl_usd: board.reduce((s, r) => s + r.tvl_usd, 0),
    median_change_7d: medChange === null ? null : round4(medChange),
    reported: changes.length,
    gainers: changes.filter((c) => c > 0).length,
    losers: changes.filter((c) => c < 0).length,
  };
  const newest: NewListing[] = board
    .filter((r) => r.listed_at !== null)
    .sort((a, b) =>
      a.listed_at! < b.listed_at! ? 1 : a.listed_at! > b.listed_at! ? -1 : b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, 8)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      listed_at: r.listed_at!,
      category: r.category,
      tvl_usd: r.tvl_usd,
      implied_value_usd: r.implied_value_usd,
      watchlist: r.watchlist,
    }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    score: SCORE,
    launched_count: launch.launched,
    snapshot_count: launch.total,
    launch_share: round4(launch.share),
    global_comp_ratio: round4(comps.globalRatio),
    global_comp_count: comps.globalCount,
    comp_stats: compStats,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: live.length,
    live_total: liveTotal,
    pulse,
    newest,
    categories,
    rows,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears on the board more than once';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
