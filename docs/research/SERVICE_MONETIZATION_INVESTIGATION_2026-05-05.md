# NARA Service Monetization Investigation

Date: 2026-05-05

Status: internal strategy research. This is not public launch copy.

Current repo truth: public NARA is still v3 on Base. Fresh v4 is implemented locally but not yet a verified public launch candidate. Do not sell, market, or integrate v4-only services until the fresh v4 deploy, preflight, smoke, allocation verification, and relevant composability checks are complete.

## Executive Decision

NARA should not try to make money by being "another staking app." The protocol's defensible asset is a commitment engine: time-weighted positions, explicit reward routing, position NFTs, sponsor/campaign primitives, and composability surfaces. The services should monetize those primitives.

The best revenue path is:

1. Sponsor Campaigns as a Service.
2. Principal-preserving jackpot and season games.
3. stNARA / position management for users who want liquid commitment exposure.
4. Genesis commitment sales and position marketplace.
5. Later: curated launch campaigns for other Base projects.

Prediction markets and high-frequency trading games are commercially attractive, but they are legal and operational traps if launched directly without counsel. They should be treated as a later regulated/partnered lane, not the first revenue product.

## Market Signals

Base has enough liquidity for NARA to build onchain services around USDC, positions, and app campaigns.

- DefiLlama API showed Base at about USD 4.63B DeFi TVL on 2026-05-05.
- DefiLlama stablecoin data showed about USD 4.88B stablecoin supply on Base, with USDC about USD 4.46B.
- Base's own 2026 strategy emphasizes global markets, stablecoins, tokenized assets, prediction markets, and agent-native commerce.
- Dune and Keyrock reported prediction-market monthly notional volume above USD 13B in Nov 2025, with 43M+ monthly transactions and 600K+ monthly users excluding Kalshi.
- KPMG reported Kalshi and Polymarket combined trading volume exceeded USD 40B in 2025, up from roughly USD 9B in 2024, but also warns that unregulated access can trigger CFTC enforcement risk.
- CFTC publicly asserted exclusive jurisdiction over U.S. commodity derivative markets including event-contract/prediction markets in Feb 2026.
- PoolTogether validates the prize-savings pattern: users deposit, yield accrues, and yield funds prizes while principal remains withdrawable under the protocol's rules.
- Pendle validates the market for tokenized yield if NARA's SY adapter is deployed and tested. Pendle's SY adapter model standardizes deposit, redeem, exchange-rate, and reward-claim behavior for heterogeneous yield-bearing assets.
- Base-native launch and creator-token products prove fee-sharing launch surfaces can make money, but they are extremely attention-cycle dependent and carry scam/rug optics. NARA should not compete head-on with mass token launchers.

## NARA's Actual Advantage

NARA already has or plans these primitives:

- Fixed-supply NARA.
- Engine reward routing for NARA, ETH, and ERC-20 rewards.
- NFT-owned commitment positions in v4.
- NFT bond positions.
- Liquidity-growth hook and vault routing on Uniswap v4.
- stNARA wrapper.
- Pendle SY adapter.
- Fractional position wrappers.
- Lotto and arena surfaces.
- Sponsor hub pattern in v3, with a v4 sponsor hub deferred.

This means NARA's monetization should center on:

- Charging for campaigns that route rewards into NARA positions.
- Charging for user-friendly access to commitment positions.
- Charging for liquidity, marketplace, and campaign services around those positions.
- Making sponsors, projects, and traders pay for distribution while committed NARA users receive visible reward flow.

## User Segments

### 1. Committed Holders

Need:
- Simpler participation.
- Clear reward accounting.
- Liquidity options.
- Position portability.

Paying behavior:
- Will tolerate performance fees if the service saves effort and improves reward capture.
- Will buy Genesis or boosted positions if terms are simple and visible.

Best offers:
- stNARA vault.
- Position manager.
- Reward auto-claim / compound service.
- NFT position marketplace.

### 2. Small Retail Users

Need:
- A reason to participate without understanding all engine math.
- Limited downside.
- Social events and visible outcomes.

Paying behavior:
- Will pay small entry, convenience, or gasless fees for games.
- Will participate in sponsored jackpots if principal mechanics are clear.

Best offers:
- Lotto seasons.
- Sponsored jackpots.
- Founding board / badge seasons.
- Low-friction USDC/NARA entry flows.

### 3. Sponsors And Whales

Need:
- Visible status.
- Principal-preserving support.
- Reward routing to a campaign they care about.
- Optional future retargeting.

Paying behavior:
- Will lock larger amounts if sponsorship is public, useful, and recoverable after maturity.
- Will pay campaign setup fees if they get acquisition, reputation, and dashboard visibility.

Best offers:
- Sponsor Campaigns as a Service.
- Branded jackpot seasons.
- Arena prize sponsorship.
- Partner reward routes.

### 4. Other Base Projects

Need:
- User acquisition.
- Sticky holders.
- Campaign mechanics that do not look like raw bribery.
- Onchain dashboards and distribution.

Paying behavior:
- Will pay USDC setup fees, campaign fees, prize funding, and revenue share.
- May accept NARA burn/commit requirements if NARA brings users.

Best offers:
- Commitment campaign platform.
- Sponsored prize seasons.
- Launch allocation campaigns.
- Partner reward routing into NARA commitment weight.

### 5. DeFi Integrators

Need:
- Liquid ERC-20 surfaces.
- Yield tokenization.
- Oracle-friendly data.
- Safe, indexed metadata.

Paying behavior:
- Usually will not pay upfront unless there is TVL.
- Can generate protocol revenue through volume, AMM fees, and external market activity.

Best offers:
- stNARA AMM.
- Pendle PT/YT market after validation.
- Fractional position marketplace.
- Analytics/indexer API.

## Service Offers

## Offer 1: Sponsor Campaigns as a Service

What it is:
NARA lets a sponsor create a campaign where sponsor capital is committed, sponsor yield flows to a target game or jackpot, and the sponsor gets public status plus optional future retargeting.

Why it fits:
The repo already contains a sponsor hub pattern. The live docs explain the problem: direct sponsor positions are trapped inside a specific game contract; the hub fixes this by keeping sponsor ownership stable and routing future rewards to a campaign receiver.

Target buyers:
- Base projects launching campaigns.
- NARA whales.
- Creator communities.
- DAOs.
- Protocols that want user acquisition without mercenary emissions.

Revenue model:
- Setup fee: 500-5,000 USDC per campaign.
- Reward routing fee: 5-15% of harvested rewards before forwarding to the target.
- Optional prize funding fee: 1-3% of direct prize funding.
- NARA requirement: sponsor must commit or burn NARA to open a campaign.
- Premium dashboard: 100-500 USDC/month for analytics, sponsor pages, and campaign reports.

Why users pay:
Sponsors get visible contribution without donating principal. Projects get a campaign mechanic that creates recurring prize/reward flow instead of one-time airdrop churn.

Build path:
1. Use v3 sponsor hub for lotto-compatible campaigns where safe.
2. Do not force live arena V2 through the adapter because it lacks `fundPrize(uint256)`.
3. After v4 core is stable, design `NARASponsorHubV4`.
4. Build campaign pages: sponsor identity, committed principal, accrued rewards, flushed rewards, target, campaign status.

Main risk:
Requires careful language. Sponsors are funding rewards, not buying guaranteed acquisition or yield.

Verdict:
Highest priority. This is the best B2B money path because projects pay more predictably than retail users.

## Offer 2: Sponsored Jackpot Seasons

What it is:
A recurring lotto-like product where users commit a bounded amount, yield routes into a prize pool, and sponsors can deepen jackpots without entering the draw.

Why it fits:
The existing NARA Lotto already implements the core idea: player principal remains economically tied to the depositor, yield funds the jackpot, and sponsors increase prize depth without distorting player odds.

Target users:
- Small retail users.
- Sponsor-backed communities.
- Partner projects that want weekly/monthly events.

Revenue model:
- Season fee paid by sponsor: 1,000-10,000 USDC depending on duration and promotion.
- Protocol fee on direct prize funding: 1-3%.
- Harvest/draw keeper bounty spread: protocol can retain a small share if the caller is the NARA keeper.
- Optional entry convenience fee: small fixed USDC or NARA burn, but avoid making early UX too expensive.
- Sponsor dashboard subscription.

Why users pay:
Retail gets a simple event. Sponsors get an onchain billboard plus jackpot growth. NARA committed users benefit if fees route back to engine/Genesis/USDC rewards.

Build path:
1. Improve lotto UI around "economic pot" versus harvested pot.
2. Add sponsor pages and season history.
3. Add gas sponsorship for first-time users if budget allows.
4. Add partner campaigns only after legal review of prize/lottery wording.

Main risk:
Lottery/gaming law. Principal-preserving mechanics reduce economic harm but do not remove legal analysis. Avoid U.S. public gambling language.

Verdict:
High priority after sponsor campaign infrastructure. This is NARA's most legible retail product.

## Offer 3: stNARA Managed Commitment Vault

What it is:
Users deposit NARA and receive stNARA. The pool manages max-duration commitment positions, harvests rewards, distributes ETH/USDC through indexes, and queues redemptions.

Why it fits:
The repo already contains `NARAStakingPoolV4` and `NARAStakingPoolSYV4`. The missing work is deployment, seeding, UI, monitoring, and external integration.

Target users:
- Users who want exposure without managing NFT positions.
- DeFi users who need ERC-20 composability.
- Future Pendle users.

Revenue model:
- Performance fee: 5-10% of external ETH/USDC rewards, not core NARA emission at first.
- Withdrawal queue fee: 0.1-0.5% if needed for protocol operations.
- AMM LP fee capture through NARA/stNARA liquidity.
- Optional premium automation: auto-harvest/claim service fee.

Why users pay:
Manual commitment positions have cognitive overhead. A liquid ERC-20 wrapper is easier to hold, trade, and integrate.

Build path:
1. Fresh v4 deploy and allocation verification.
2. Deploy stNARA.
3. Seed initial deposit with at least the required first-deposit amount.
4. Build UI showing exchange rate, liquid NARA, locked principal, queued redemptions, ETH/USDC rewards, and redemption delay.
5. Only then create NARA/stNARA AMM.
6. Only after that validate Pendle SY and discuss a PT/YT market.

Main risk:
Liquidity mismatch. Redemptions are queued, not instant. The UI must make this impossible to miss.

Verdict:
High strategic priority. It is the bridge from NARA as a game/token into NARA as DeFi collateral/yield infrastructure.

## Offer 4: Genesis Commitment NFTs And Marketplace

What it is:
Users buy, earn, and trade NFT-owned commitment positions. Genesis metadata can attach tiers, reward multipliers, and status. A marketplace gives holders liquidity before maturity.

Why it fits:
v4's `NARAPositionNFTV4` and `NARABondDepositoryV4NFT` already point here. The product is not just a "bond"; it is a tradable commitment asset.

Target users:
- Committed holders who want status and portability.
- Bond buyers.
- Secondary buyers who want a pre-activated or mature position.
- Sponsors and campaign participants.

Revenue model:
- Primary sale spread or bond treasury split.
- Marketplace royalty: 1-2.5% where enforceable or through NARA-owned marketplace UI.
- Featured listings / sponsor fees.
- Small claim/automation fee if user opts into managed claiming.

Why users pay:
NFT positions solve the "my capital is stuck in an account" problem. Buyers can purchase duration, activation history, and reward rights instead of starting from zero.

Build path:
1. Open public v4 NFT commitment flow first.
2. Keep bonds closed until terms/cap/roles are verified.
3. Build a position explorer: principal, weight, activation, maturity, claimable rewards, Genesis metadata.
4. Add marketplace guidance before external listing.
5. Later add fractional wrappers with warnings that post-principal-claim supply does not shrink.

Main risk:
Users may overpay for complex positions if metadata is unclear. Bad marketplace UX creates reputational risk.

Verdict:
High priority, but after v4 launch safety. This is NARA's best native "asset" product.

## Offer 5: Arena And Skill-Tournament Seasons

What it is:
Entry-fee competitions where users compete for prizes. NARA can monetize entry fees, sponsor prizes, and optional boosts. The arena is the first form; future versions could use PnL or strategy games instead of pure burn-to-race mechanics.

Why it fits:
NARA already has BurnRunArena contracts and UI. The concept connects to the burn/commitment loop, but v2 has sponsor limitations and must be seeded before it feels alive.

Target users:
- Degens.
- Existing NARA holders.
- Sponsor-backed communities.
- Partner projects that want competitive campaigns.

Revenue model:
- Rake on entry fees: 5-10%.
- Sponsor season fee.
- NARA burn for boosts or cosmetics.
- Creator/community-hosted arenas with NARA platform fee.

Why users pay:
Games convert static token holding into repeat activity. Repeated activity creates visible reward flow.

Build path:
1. Seed live arena V2 only if the sponsor lane is operational.
2. Prefer future V3-style arena target with `fundPrize(uint256)` compatibility.
3. Add clear leaderboards, prize liabilities, and settlement status.
4. Avoid "guaranteed earning" language.

Main risk:
Pure burn gameplay can feel extractive unless prizes and sponsor funding are visible.

Verdict:
Medium-high priority. Good for engagement, weaker as core revenue than sponsor campaigns and stNARA.

## Offer 6: Curated Launch Campaigns For Base Projects

What it is:
NARA helps projects launch token or community campaigns that require NARA commitment weight for allocation, route part of fees/prizes to NARA rewards, and use Genesis/NFT positions for early supporters.

This is not a mass memecoin launcher. It should be a curated commitment launch service.

Target buyers:
- Serious Base projects.
- Creator communities with existing audiences.
- Small protocols that need sticky holders, not one-day farm volume.

Revenue model:
- Setup fee: 5,000-25,000 USDC.
- Raise fee: 1-3%.
- Required NARA burn or commitment for listing.
- Ongoing campaign fee: 5-15% of sponsor/reward routing.
- Optional marketplace fee on campaign NFTs.

Why users pay:
Projects pay for distribution, commitment, dashboards, and a less extractive launch format. Users get allocation access tied to time commitment instead of bot-speed.

Build path:
1. Do not build this before v4 and sponsor campaigns are working.
2. Start with one partner campaign.
3. Require compliance review and clear token-risk disclaimers.
4. Use USDC for payments and NARA for access/discount/status, not as the only fee token.

Main risk:
Launchpads attract bad projects. One bad launch can damage NARA more than it earns.

Verdict:
Later high-upside lane. Curated only.

## Offer 7: Position Analytics And Automation

What it is:
Dashboards, alerts, and automation for NARA positions, sponsor campaigns, vault route modes, claims, maturity, reward routing, and liquidity state.

Target users:
- Large holders.
- Sponsors.
- Operators.
- Partner projects.
- DeFi integrators.

Revenue model:
- Free public dashboard for trust.
- Paid sponsor/project dashboards: 100-1,000 USDC/month.
- Automation fee for keeper operations.
- API access for integrators.

Why users pay:
NARA's mechanics are complex. Visibility is not optional; it is part of the product.

Build path:
1. Index engine positions, rewards, maturity, and route modes.
2. Add sponsor/campaign accounting.
3. Add alerts: maturity, claimable rewards, stale epoch, draw ready, capacity change, route mode change.
4. Offer CSV/API exports to sponsors and partner projects.

Main risk:
Analytics alone is not a strong consumer product. It monetizes best as part of sponsor campaigns.

Verdict:
Build as infrastructure for other offers. Monetize B2B, not retail.

## Offer 8: Prediction Markets

What it is:
Event-outcome trading or forecast games.

Commercial signal:
Very strong. Prediction markets exploded in 2025-2026. Dune and KPMG data show major volume growth.

Why not first:
The legal surface is too large. CFTC jurisdiction, state gambling disputes, sports-betting overlap, and market-resolution disputes all create a heavy burden.

Safer NARA angle:
- Do not launch a public money prediction market first.
- Build forecast tournaments with sponsor-funded prizes and no user-wager custody only after legal review.
- Build prediction-market analytics, watchlists, or affiliate/integration products instead of operating markets.
- If entering directly, partner with regulated infrastructure or remain outside restricted jurisdictions with counsel-approved flows.

Revenue model if legal path exists:
- Market creation fees.
- Trading fees.
- Sponsor-funded markets.
- Data subscription.

Verdict:
High market demand, low immediate suitability. Defer.

## Prioritization Matrix

| Rank | Service | Revenue Potential | Build Fit | Legal Risk | Time To First Revenue | Priority |
|---|---:|---:|---:|---:|---:|---|
| 1 | Sponsor Campaigns as a Service | High | High | Medium | Short | P0 |
| 2 | Sponsored Jackpot Seasons | Medium-high | High | Medium-high | Short | P0 |
| 3 | stNARA Managed Commitment Vault | High | High | Medium | Medium | P1 |
| 4 | Genesis NFT Position Marketplace | Medium-high | High | Medium | Medium | P1 |
| 5 | Position Analytics / Automation | Medium | High | Low | Short | P1 |
| 6 | Arena / Skill-Tournament Seasons | Medium | Medium-high | Medium-high | Short | P2 |
| 7 | Curated Launch Campaigns | High | Medium | High | Medium-long | P2 |
| 8 | Prediction Markets | Very high | Medium | Very high | Long | P3 |

## Recommended Revenue Architecture

Do not make every user action require a NARA burn. That creates friction before the network is large enough to absorb it.

Use this hybrid model:

- Users pay mostly in USDC or ETH where the pain is explicit: campaigns, sponsorship, marketplace, launch services, automation.
- NARA is used for access, discounts, status, boosted allocation, commitment weight, and selective burns.
- External reward flow routes to committed NARA users where possible.
- Protocol treasury takes a transparent service fee before reward routing.

Default fee policy:

- Sponsor setup fee: USDC.
- Campaign/routing fee: USDC or percentage of rewards.
- Retail entry fee: tiny, ideally subsidized by sponsors at first.
- Marketplace fee: USDC/ETH/NARA depending on settlement token.
- stNARA performance fee: external rewards only at launch.
- Launch campaign fee: USDC plus NARA commitment/burn requirement.

## 90-Day Execution Roadmap

### Days 0-15: Commercial Readiness

- Confirm legal framing for lotto, sponsor campaigns, arena, and any "season" terminology.
- Define fee policy and treasury routing.
- Create campaign accounting spec.
- Decide whether sponsor fees route to treasury, engine rewards, Genesis rewards, or split.
- Add public dashboard requirements to v4 launch UX.

### Days 15-45: First Paid Sponsor Product

- Package Sponsor Campaigns as a Service.
- Build sponsor landing/admin UI.
- Add campaign pages with sponsor identity, target, rewards harvested, rewards flushed, and campaign status.
- Run one internal or friendly sponsor season.
- Charge a real setup fee, even if discounted.

### Days 45-75: Retail Event Loop

- Launch a sponsored jackpot season.
- Add economic pot, draw readiness, player count, sponsor contribution, and winner history.
- Add gas sponsorship only for allowed user actions.
- Publish transparent post-season accounting.

### Days 75-90: DeFi Surface

- If v4 is live and verified, deploy stNARA.
- Build stNARA dashboard.
- Seed initial liquidity only after monitored behavior.
- Start Pendle SY validation, not outreach, until reward-index behavior is proven on deployed contracts.

## What Not To Do

- Do not market v4 services as live before the fresh v4 redeploy is verified.
- Do not open bonds just to create activity.
- Do not build a direct prediction market first.
- Do not sell fixed APY or guaranteed returns.
- Do not make NARA burns mandatory for every interaction while liquidity is thin.
- Do not let launchpad revenue tempt the project into listing weak partner tokens.
- Do not hide queue/redemption/liquidity risks behind simplified UX.

## One-Sentence Strategy

NARA should sell campaign and position infrastructure around committed capital: sponsors pay to create visible reward flow, users participate through jackpots and tradable commitment positions, and DeFi users enter later through stNARA, Pendle, and fractional wrappers.

## Sources

- NARA current state: `../CURRENT_STATE.md`
- NARA roadmap: `../ROADMAP.md`
- NARA PRD: `../PRD.md`
- NARA apps map: `../APPS.md`
- Sponsor hub architecture: `../SPONSOR_HUB.md`
- Lotto explainer: `../LOTTO_EXPLAINER.md`
- v4 opportunity gaps: `../V4_OPPORTUNITY_GAPS.md`
- Base 2026 strategy: https://blog.base.org/2026-mission-vision-and-strategy
- DefiLlama Base TVL API: https://api.llama.fi/v2/chains
- DefiLlama stablecoin API: https://stablecoins.llama.fi/stablecoins?chain=Base
- DefiLlama fees API: https://api.llama.fi/overview/fees
- Dune prediction markets report: https://dune.com/prediction-markets-report
- Dune prediction market data docs: https://docs.dune.com/data-catalog/curated/prediction-markets/overview
- KPMG prediction markets paths to entry: https://kpmg.com/kpmg-us/content/dam/kpmg/pdf/2026/prediction-markets-paths-to-entry.pdf
- CFTC Feb 17 2026 prediction market jurisdiction release: https://www.cftc.gov/PressRoom/PressReleases/9183-26
- PoolTogether V5 protocol design: https://dev.pooltogether.com/protocol/design/
- Pendle Standardized Yield docs: https://docs.pendle.finance/pendle-v2/Developers/Contracts/StandardizedYield
- Zora creator coins support: https://support.zora.co/en/articles/6316801
- Clanker creator rewards and fees docs: https://clanker.gitbook.io/clanker-documentation/general/creator-rewards-and-fees
