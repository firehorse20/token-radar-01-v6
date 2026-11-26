// radar-7: the value model for token-radar-01 v6.
//
// A protocol's implied launch value is its TVL priced by the live market
// (the category's geometric median market-cap / TVL ratio), moved by
// seventeen named factors and capped by a live-cap anchor. No protocol
// name is ever special-cased: every number below comes from the snapshot.
//
// New in radar-7 over radar-6:
//   - live-cap anchor: no implied value may exceed 1.5x the largest live
//     market cap its category can evidence (the global max when the
//     category holds fewer than three live market caps), so the board can
//     never claim a launch is worth more than the live market has ever
//     paid for a peer — and a thin category does not punish its biggest
//     protocols for the market's thinness.
//   - liveliness: categories where tokens already trade have a proven
//     launch path, and price a little higher.
//   - early-momentum: a young protocol growing fast gets a boost; the
//     same growth on a mature protocol is already priced in.
//   - drawdown guard: TVL bleeding faster than -25% a week is discounted
//     beyond the momentum curve.
//   - standing: the protocol's TVL percentile inside its own category's
//     pre-token set, so a category leader is worth more than a rounding
//     error even when its share of category TVL is small.
//   - age retuned: the hump now peaks at 2 years and decays to a 0.88
//     floor, so a six-year-old protocol with no token is not written off.
//   - the board now carries every below-floor product and deployment
//     (47 + 10), not a cut of them.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface Factor {
  key: string;
  label: string;
  value: number;
  note: string;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_years: number | null;
  tier: 'standard' | 'product' | 'deployment';
  watchlist: boolean;
  multiple: number;
  multiple_confidence: 'priced' | 'thin' | 'global';
  multiple_live_count: number;
  anchor_cap_usd: number;
  anchor_bound: boolean;
  confidence: number;
  risk_flags: string[];
  factors: Factor[];
}

export interface CategoryMultiple {
  category: string;
  multiple: number;
  live_count: number;
  confidence: 'priced' | 'thin' | 'global';
  live_median_change_7d: number | null;
  live_max_mcap_usd: number | null;
}

export interface LiveAside {
  slug: string;
  name: string;
  category: string;
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface BoardOutput {
  meta: {
    model: string;
    as_of: string;
    floor_usd: number;
    rows: number;
    watchlist_rows: number;
    global_multiple: number;
    total_implied_usd: number;
    rank1_slug: string;
    rank1_name: string;
  };
  rows: BoardRow[];
  categories: CategoryMultiple[];
  live_aside: LiveAside[];
  live_count: number;
  pre_token_count: number;
}

// ---------------------------------------------------------------- constants

const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$|(V\d+|v\d+)$/;
const MAJOR_CHAINS = new Set([
  'Ethereum', 'Solana', 'Arbitrum', 'Base', 'BSC', 'Polygon', 'Optimism',
  'Avalanche', 'Tron', 'Bitcoin', 'zkSync Era', 'Linea', 'Blast', 'Mantle',
  'Sui', 'Sei', 'Berachain', 'Hyperliquid', 'Starknet',
]);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round4 = (v: number): number => Math.round(v * 10000) / 10000;

/** Percentile of v among values: share below plus half the ties. Deterministic. */
function percentile(values: number[], v: number): number {
  if (values.length === 0) return 0.5;
  let below = 0;
  let equal = 0;
  for (const x of values) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (below + 0.5 * equal) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Geometric median: exp(median of logs). Ratios are log-normal, so this is the honest centre. */
function geometricMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const logs = values.map((v) => Math.log(Math.max(v, 1e-9)));
  const m = median(logs);
  return m === null ? null : Math.exp(m);
}

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / 86400000);
}

// ---------------------------------------------------------------- classification

export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

function isExchange(p: SnapshotProtocol): boolean {
  if (p.category === 'CEX') return true;
  return EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix));
}

function isProduct(p: SnapshotProtocol): boolean {
  return (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) || WRAPPED_WORD.test(p.name);
}

function isDeployment(p: SnapshotProtocol): boolean {
  return VERSION_SUFFIX.test(p.name);
}

function tierOf(p: SnapshotProtocol): 'standard' | 'product' | 'deployment' {
  if (isDeployment(p)) return 'deployment';
  if (isProduct(p)) return 'product';
  return 'standard';
}

// ---------------------------------------------------------------- farm plans

interface Venue {
  venue: string;
  action: string;
}

const VENUES: Array<[string, string, string]> = [
  ['lending', 'lending market', 'Lend the deposit and borrow 40% of its value in a stablecoin against it, then re-deposit the borrowed stablecoin. This looped position earns lending yield and any points the protocol tracks'],
  ['dex', 'liquidity pool', 'Add the deposit as liquidity to the largest pool on the protocol, paired half in the base asset and half in a stablecoin. A concentrated range around the current price earns the most fees'],
  ['yield', 'yield vault', 'Deposit into the highest-TVL vault and enable auto-compounding so rewards restake themselves. Check the vault strategy page first so you know what the yield is actually doing'],
  ['rwa', 'tokenised asset vault', 'Mint or buy the tokenised asset with the deposit and hold it in the protocol vault. Real-world-asset positions are slow but steady, so leave the position alone for at least a month'],
  ['liquid staking', 'staking pool', 'Stake the deposit through the protocol and hold the liquid staking token it mints. Use that receipt token in a lending market as well, so one deposit earns twice'],
  ['deriv', 'perpetuals market', 'Open a small hedged perpetuals position with the deposit as margin, keeping leverage under 2x. A delta-neutral long plus a short elsewhere earns funding without betting on direction'],
  ['perp', 'perpetuals market', 'Open a small hedged perpetuals position with the deposit as margin, keeping leverage under 2x. A delta-neutral long plus a short elsewhere earns funding without betting on direction'],
  ['cdp', 'collateralised debt position', 'Lock the deposit as collateral and mint stablecoins against it at a 50% loan-to-value ratio. Keep the collateral ratio above 200% so a price dip never liquidates the position'],
  ['restak', 'restaking vault', 'Restake the deposit in the protocol vault and delegate to an operator with a long uptime record. Restaked positions are locked for days, so size it as money you will not need soon'],
  ['bridge', 'bridge pool', 'Bridge the deposit across the protocol to the chain where its pools pay best, then add it as bridge liquidity. Bridge volume is the activity a future token would most likely reward'],
  ['basis', 'basis trading vault', 'Deposit into the basis trading vault, which earns the spread between spot and futures. Basis trades are market-neutral, so the return comes from funding, not from price moves'],
  ['curator', 'curated vault', 'Deposit into the curator vault with the longest track record and the lowest fee. Curators allocate across strategies, so read the current allocation before depositing'],
  ['risk', 'curated vault', 'Deposit into the curator vault with the longest track record and the lowest fee. Curators allocate across strategies, so read the current allocation before depositing'],
  ['payment', 'payments pool', 'Route a real weekly payment through the protocol for the deposit amount, so the wallet shows genuine usage instead of one idle deposit. Real usage is what a points system should reward'],
  ['insurance', 'coverage pool', 'Buy coverage for the deposit amount on the protocol, then provide the same amount to its coverage pool. Underwriting earns premiums while the cover itself protects the position'],
  ['stablecoin', 'stablecoin minter', 'Mint the protocol stablecoin against the deposit at a 50% loan-to-value ratio and hold the minted coins in its savings vault. Keep the collateral ratio above 200% at all times'],
  ['synthetic', 'synthetics market', 'Mint a synthetic asset with the deposit and hold it in the protocol vault. Synthetics track real prices, so the position earns fees without taking a directional bet'],
  ['farm', 'farm', 'Stake the deposit in the highest-APR farm and claim rewards every week, restaking them at once. Farms pay best early, so check the emission schedule before committing'],
];

function venueFor(category: string): Venue {
  const lower = category.toLowerCase();
  for (const [keyword, venue, action] of VENUES) {
    if (lower.includes(keyword)) return { venue, action };
  }
  return {
    venue: 'core product',
    action: 'Use the deposit in the protocol\'s core product for its main advertised purpose, following the steps on its own documentation page. A real position in the real product is what counts',
  };
}

const GAS_BY_CHAIN: Record<string, number> = {
  Ethereum: 18, Solana: 2, Base: 3, Arbitrum: 3, BSC: 4, Polygon: 3,
  Optimism: 3, Avalanche: 4, Tron: 3, Sui: 2, Sei: 2,
};

function gasFor(chain: string): number {
  return GAS_BY_CHAIN[chain] ?? 8;
}

function depositFor(tvl: number): number {
  if (tvl >= 40_000_000) return 2000;
  if (tvl >= 20_000_000) return 1000;
  if (tvl >= 10_000_000) return 500;
  return 250;
}

function farmSteps(p: SnapshotProtocol, tier: string): string[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const secondChain = p.chains[1] ?? null;
  const deposit = depositFor(p.tvl_usd);
  const gas = gasFor(chain);
  const category = p.category ?? 'Uncategorised';
  const { venue, action } = venueFor(category);
  const effort = p.chains.length >= 3 || /deriv|perp|basis/i.test(category) ? 'High' : p.chains.length === 1 ? 'Low' : 'Medium';
  const totalCost = gas * 6 + 12;
  const hours = effort === 'High' ? 10 : effort === 'Medium' ? 8 : 6;
  const steps: string[] = [];
  steps.push(
    `Set up a fresh wallet on ${chain} and fund it with $${deposit + 100} in total, the farming position plus gas. Buying the gas token on a centralised exchange and withdrawing it takes about 15 minutes and costs roughly $${gas} in network fees.`,
  );
  steps.push(
    `Deposit $${deposit} into ${p.name}'s main ${venue} on ${chain}. Connect the wallet in the protocol's app, approve the token spend, then confirm the deposit; allow 20 minutes and keep the transaction hash for your records.`,
  );
  steps.push(`${action}; allow 30 minutes to set it up properly.`);
  if (secondChain) {
    steps.push(
      `Repeat the same position on ${secondChain} with half the deposit, about $${Math.round(deposit / 2)}. A second chain doubles the wallet's footprint in the protocol and shows activity the single-chain farmers miss; allow 25 minutes.`,
    );
  } else {
    steps.push(
      `Before adding more, verify the protocol's contracts: check its audit page and confirm its TVL has not fallen sharply in the last week. A ten-minute check now is cheaper than an exit later.`,
    );
  }
  steps.push(
    `Open ${p.name}'s points or rewards page, connect the same wallet, and confirm the position shows up. Screenshot the balance and repeat the check every two weeks so a missing position is caught early.`,
  );
  steps.push(
    `Once a week, top the position back up to $${deposit} if it drifted and claim or restake any rewards. Budget 20 minutes a week for eight weeks; never let the position sit idle for a whole month.`,
  );
  steps.push(
    `Keep this farm to at most 5% of your farming budget. If ${p.name}'s TVL falls more than 30% in a week, or its points page stops updating, unwind half the position the same day.`,
  );
  steps.push(
    `Watch for a token announcement on the protocol's official channels. When a claim opens, claim inside the first week, then unwind the position over two days to avoid exit slippage.`,
  );
  steps.push(
    `All in, expect about $${totalCost} in gas and fees and ${hours} hours of active time over eight weeks. Effort: ${effort}. Never deposit money you need back before the token decision.`,
  );
  return steps;
}

// ---------------------------------------------------------------- the board

export function buildBoard(snapshot: Snapshot): BoardOutput {
  const asOf = snapshot.as_of;
  const floor = snapshot.floor_usd;
  const watch = new Set(snapshot.watchlist);
  const protocols = snapshot.protocols;

  const live = protocols.filter(hasToken);
  const pre = protocols.filter((p) => !hasToken(p));

  // --- live-market pricing per category -------------------------------------
  // For every category, the live protocols' mcap/TVL ratios, winsorized,
  // then the geometric median shrunk in log space toward the global
  // geometric median by sample size (weight n / (n + 6)).
  const liveByCat = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const cat = p.category ?? 'Uncategorised';
    const arr = liveByCat.get(cat);
    if (arr) arr.push(p);
    else liveByCat.set(cat, [p]);
  }
  const globalRatios: number[] = [];
  for (const p of live) {
    if (p.mcap_usd !== null && p.tvl_usd > 0) {
      globalRatios.push(clamp(p.mcap_usd / p.tvl_usd, 0.02, 3.0));
    }
  }
  const globalMedian = geometricMedian(globalRatios) ?? 0.25;
  const globalMaxMcap = live.reduce((m, p) => Math.max(m, p.mcap_usd ?? 0), 0);

  const catStats = new Map<string, {
    multiple: number;
    confidence: 'priced' | 'thin' | 'global';
    liveCount: number;
    liveMedianChange: number | null;
    liveMaxMcap: number | null;
    liveMcapCount: number;
    totalTvl: number;
  }>();
  const allCats = new Set<string>();
  for (const p of protocols) allCats.add(p.category ?? 'Uncategorised');
  for (const cat of [...allCats].sort()) {
    const members = liveByCat.get(cat) ?? [];
    const ratios: number[] = [];
    for (const p of members) {
      if (p.mcap_usd !== null && p.tvl_usd > 0) ratios.push(clamp(p.mcap_usd / p.tvl_usd, 0.02, 3.0));
    }
    const n = ratios.length;
    const geo = geometricMedian(ratios);
    let multiple: number;
    let confidence: 'priced' | 'thin' | 'global';
    if (n >= 3 && geo !== null) {
      const w = n / (n + 6);
      multiple = Math.exp(w * Math.log(geo) + (1 - w) * Math.log(globalMedian));
      confidence = n >= 8 ? 'priced' : 'thin';
    } else {
      multiple = globalMedian;
      confidence = 'global';
    }
    multiple = clamp(multiple, 0.08, 0.6);
    const changes = members.map((p) => p.change_7d).filter((c): c is number => c !== null);
    const mcaps = members.map((p) => p.mcap_usd).filter((c): c is number => c !== null);
    const totalTvl = protocols.filter((p) => (p.category ?? 'Uncategorised') === cat).reduce((s, p) => s + p.tvl_usd, 0);
    catStats.set(cat, {
      multiple,
      confidence,
      liveCount: n,
      liveMedianChange: median(changes),
      liveMaxMcap: mcaps.length > 0 ? Math.max(...mcaps) : null,
      liveMcapCount: mcaps.length,
      totalTvl,
    });
  }

  // --- per-category percentile baselines (pre-token set only) --------------
  const preByCat = new Map<string, SnapshotProtocol[]>();
  for (const p of pre) {
    const cat = p.category ?? 'Uncategorised';
    const arr = preByCat.get(cat);
    if (arr) arr.push(p);
    else preByCat.set(cat, [p]);
  }
  const changeByCat = new Map<string, number[]>();
  const velocityByCat = new Map<string, number[]>();
  const tvlByCat = new Map<string, number[]>();
  for (const [cat, members] of [...preByCat.entries()].sort()) {
    changeByCat.set(cat, members.map((p) => p.change_7d ?? 0));
    tvlByCat.set(cat, members.map((p) => p.tvl_usd));
    velocityByCat.set(
      cat,
      members.map((p) => {
        const days = p.listed_at === null ? 365 : Math.max(daysBetween(p.listed_at, asOf), 30);
        return p.tvl_usd / days;
      }),
    );
  }

  // --- board selection ------------------------------------------------------
  // The watchlist in full; every below-floor pre-token protocol that is not
  // an exchange; above-floor protocols the watchlist leaves out stay out
  // (the house excludes them for a parent protocol the snapshot does not
  // carry, and this radar does not second-guess that).
  const selected: SnapshotProtocol[] = [];
  for (const p of pre) {
    if (isExchange(p)) continue;
    if (watch.has(p.slug)) {
      selected.push(p);
    } else if (p.tvl_usd < floor) {
      selected.push(p);
    }
  }

  // --- dollar-flow baseline: the week's dollar TVL change across the board -
  const dollarChanges = selected.map((p) => p.tvl_usd * ((p.change_7d ?? 0) / 100));

  // --- score each row -------------------------------------------------------
  const rows: BoardRow[] = [];
  for (const p of selected) {
    const cat = p.category ?? 'Uncategorised';
    const stats = catStats.get(cat)!;
    const tier = watch.has(p.slug) ? 'standard' : tierOf(p);
    const change = p.change_7d ?? 0;
    const c = clamp(change, -80, 200);
    const ageYears = p.listed_at === null ? null : daysBetween(p.listed_at, asOf) / 365.25;
    const ageForCalc = ageYears ?? 2.0;
    const daysListed = p.listed_at === null ? 365 : Math.max(daysBetween(p.listed_at, asOf), 30);
    const velocity = p.tvl_usd / daysListed;
    const dollarChange = p.tvl_usd * (change / 100);

    const factors: Factor[] = [];
    const push = (key: string, label: string, value: number, note: string): number => {
      factors.push({ key, label, value: round4(value), note });
      return value;
    };

    // 1. momentum: asymmetric; gains count 0.4 per 100%, losses 0.7.
    const momentum = c >= 0 ? 1 + 0.004 * c : 1 + 0.007 * c;
    push('momentum', 'Momentum (7d)', momentum, `TVL ${change >= 0 ? '+' : ''}${round2(change)}% in 7 days`);

    // 2. relative: percentile of the 7d change inside its own category.
    const relPct = percentile(changeByCat.get(cat) ?? [], change);
    const relative = 0.85 + 0.3 * relPct;
    push('relative', 'Relative momentum', relative, `7d change beats ${Math.round(relPct * 100)}% of ${cat} pre-token protocols`);

    // 3. sector: the live tokens of the category, median 7d change.
    const sectorMed = stats.liveMedianChange ?? 0;
    const sector = 1 + 0.0025 * clamp(sectorMed, -40, 40);
    push('sector', 'Sector drift', sector, `live ${cat} tokens moved ${sectorMed >= 0 ? '+' : ''}${round2(sectorMed)}% median in 7 days`);

    // 4. stability: wild weekly swings are discounted, up to 10%.
    const stability = 1 - 0.1 * clamp((Math.abs(c) - 50) / 150, 0, 1);
    push('stability', 'Stability', stability, `a ${Math.abs(round2(c))}% weekly swing is ${Math.abs(c) > 50 ? 'wild' : 'ordinary'}`);

    // 5. age: a hump that peaks at 2 years, then decays to a 0.88 floor.
    let age: number;
    if (ageForCalc < 2) age = 0.85 + 0.1 * ageForCalc;
    else age = Math.max(0.88, 1.05 - 0.03 * (ageForCalc - 2));
    push('age', 'Age', age, ageYears === null ? 'listing date unreported' : `listed ${round2(ageYears)} years ago`);

    // 6. velocity: TVL per day listed, as a percentile inside the category.
    const velPct = percentile(velocityByCat.get(cat) ?? [], velocity);
    const velocityFactor = 0.92 + 0.16 * velPct;
    push('velocity', 'Velocity', velocityFactor, `TVL per day listed beats ${Math.round(velPct * 100)}% of ${cat}`);

    // 7. scale: log TVL, 0.90 to 1.00.
    const scale = 0.9 + 0.1 * clamp(Math.log10(p.tvl_usd / 5_000_000) / 4.3, 0, 1);
    push('scale', 'Scale', scale, `TVL $${p.tvl_usd.toLocaleString('en-US')}`);

    // 8. breadth: more chains, a little more value.
    const breadth = 1 + 0.015 * Math.min(p.chains.length - 1, 8);
    push('breadth', 'Breadth', breadth, `${p.chains.length} chain${p.chains.length === 1 ? '' : 's'}`);

    // 9. chain quality: share of chains that are major networks.
    const majorShare = p.chains.length === 0 ? 0 : p.chains.filter((ch) => MAJOR_CHAINS.has(ch)).length / p.chains.length;
    const chainQuality = 1 + 0.08 * majorShare;
    push('chain_quality', 'Chain quality', chainQuality, `${Math.round(majorShare * 100)}% of its chains are major networks`);

    // 10. leadership: share of the category's TVL.
    const catShare = stats.totalTvl > 0 ? p.tvl_usd / stats.totalTvl : 0;
    const leadership = 0.94 + 0.12 * Math.min(catShare / 0.25, 1);
    push('leadership', 'Leadership', leadership, `${round2(catShare * 100)}% of ${cat} TVL`);

    // 11. dollar flow: the week's real capital movement, percentile of the board.
    const flowPct = percentile(dollarChanges, dollarChange);
    const dollarFlow = 0.92 + 0.16 * flowPct;
    push('dollar_flow', 'Dollar flow', dollarFlow, `${dollarChange >= 0 ? '+' : '-'}$${Math.abs(Math.round(dollarChange)).toLocaleString('en-US')} of TVL moved this week`);

    // 12. completeness: a thesis built on missing data is worth less.
    let completeness = 1;
    if (p.change_7d === null) completeness *= 0.98;
    if (p.listed_at === null) completeness *= 0.96;
    push('completeness', 'Completeness', completeness, p.change_7d === null || p.listed_at === null ? 'some snapshot fields are missing' : 'all snapshot fields present');

    // 13. tier: deployments and products are worth less than the protocol itself.
    const tierFactor = tier === 'deployment' ? 0.7 : tier === 'product' ? 0.6 : 1;
    push('tier', 'Tier', tierFactor, tier === 'standard' ? 'the protocol itself' : tier === 'product' ? 'a staked or bridged product' : 'a versioned deployment');

    // 14. liveliness (radar-7): categories where tokens already trade have a proven launch path.
    const liveliness = 0.97 + 0.06 * Math.min(stats.liveCount / 12, 1);
    push('liveliness', 'Liveliness', liveliness, `${stats.liveCount} live-token protocols in ${cat}`);

    // 15. early-momentum (radar-7): young and growing beats old and growing.
    let earlyMomentum = 1;
    if (ageForCalc < 2 && change > 0) {
      earlyMomentum = 1 + 0.08 * clamp(change / 100, 0, 1) * (1 - ageForCalc / 2);
    }
    push('early_momentum', 'Early momentum', earlyMomentum, ageForCalc < 2 && change > 0 ? `young (${round2(ageForCalc)}y) and growing ${round2(change)}%` : 'no young-growth boost');

    // 16. drawdown guard (radar-7): bleeding TVL is discounted beyond the momentum curve.
    const drawdown = change < -50 ? 0.85 : change < -25 ? 0.92 : 1;
    push('drawdown', 'Drawdown guard', drawdown, change < -25 ? `TVL fell ${round2(change)}% in a week` : 'no weekly drawdown');

    // 17. standing (radar-7): TVL percentile inside the category's pre-token set.
    const standPct = percentile(tvlByCat.get(cat) ?? [], p.tvl_usd);
    const standing = 0.95 + 0.1 * standPct;
    push('standing', 'Standing', standing, `TVL beats ${Math.round(standPct * 100)}% of ${cat} pre-token protocols`);

    let implied = p.tvl_usd * stats.multiple;
    for (const f of factors) implied *= f.value;

    // Live-cap anchor (radar-7): never claim more than the live market has
    // ever paid for a peer: 1.5x the largest live market cap the category
    // can evidence. A category with fewer than three live market caps
    // cannot evidence a tight anchor, so it takes the global max instead:
    // a thin category must not punish its biggest protocols for the
    // market's thinness.
    const anchorBase = stats.liveMcapCount >= 3 && stats.liveMaxMcap !== null ? stats.liveMaxMcap : globalMaxMcap;
    const anchorCap = Math.round(anchorBase * 1.5);
    const anchorBound = implied > anchorCap;
    if (anchorBound) implied = anchorCap;
    implied = Math.max(1, Math.round(implied));

    // Confidence: priced multiple, complete data, multi-chain, seasoned.
    const multScore = stats.confidence === 'priced' ? 1 : stats.confidence === 'thin' ? 0.5 : 0;
    const confidence = clamp(
      Math.round(55 + 15 * multScore + 10 * (p.change_7d !== null ? 1 : 0) + 10 * (p.listed_at !== null ? 1 : 0) + 5 * (p.chains.length > 1 ? 1 : 0) + 5 * (ageForCalc >= 0.5 ? 1 : 0)),
      0,
      100,
    );

    const riskFlags: string[] = [];
    if (change < -25) riskFlags.push('TVL falling fast');
    if (stats.confidence !== 'priced') riskFlags.push('Thin category pricing');
    if (p.change_7d === null || p.listed_at === null) riskFlags.push('Missing data');
    if (anchorBound) riskFlags.push('Capped by live market');
    if (ageYears !== null && ageYears < 0.5) riskFlags.push('Very new protocol');
    if (p.chains.length === 1) riskFlags.push('Single chain');
    if (tier === 'product') riskFlags.push('Product, not the protocol');
    if (tier === 'deployment') riskFlags.push('Versioned deployment');

    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: farmSteps(p, tier),
      category: cat,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_years: ageYears === null ? null : round2(ageYears),
      tier,
      watchlist: watch.has(p.slug),
      multiple: round4(stats.multiple),
      multiple_confidence: stats.confidence,
      multiple_live_count: stats.liveCount,
      anchor_cap_usd: anchorCap,
      anchor_bound: anchorBound,
      confidence,
      risk_flags: riskFlags,
      factors,
    });
  }

  // Rank by implied value, ties broken by slug so the order is deterministic.
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const categories: CategoryMultiple[] = [...catStats.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([category, s]) => ({
      category,
      multiple: round4(s.multiple),
      live_count: s.liveCount,
      confidence: s.confidence,
      live_median_change_7d: s.liveMedianChange === null ? null : round2(s.liveMedianChange),
      live_max_mcap_usd: s.liveMaxMcap,
    }));

  const liveAside: LiveAside[] = live
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : 1))
    .slice(0, 40)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'Uncategorised',
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));

  const totalImplied = rows.reduce((s, r) => s + r.implied_value_usd, 0);
  return {
    meta: {
      model: 'radar-7',
      as_of: asOf,
      floor_usd: floor,
      rows: rows.length,
      watchlist_rows: rows.filter((r) => r.watchlist).length,
      global_multiple: round4(globalMedian),
      total_implied_usd: totalImplied,
      rank1_slug: rows[0]?.slug ?? '',
      rank1_name: rows[0]?.name ?? '',
    },
    rows,
    categories,
    live_aside: liveAside,
    live_count: live.length,
    pre_token_count: pre.length,
  };
}
