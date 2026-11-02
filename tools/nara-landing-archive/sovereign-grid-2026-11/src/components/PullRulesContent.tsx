import { Sparkle, Crown, Trophy, ShieldCheck, Sparkle as StarIcon } from "@phosphor-icons/react";

export default function PullRulesContent() {
  return (
    <div className="space-y-4 font-sans text-xs">
      {/* 0. WHAT IS CHASSIS ALLOY? (GOOD VS BAD) */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-amber-950/40 via-[#03060e] to-slate-900/70 border border-amber-500/40 space-y-3 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
          <div className="flex items-center gap-2 text-amber-300 font-bold uppercase text-[11px] tracking-wider">
            <Trophy size={16} weight="fill" className="text-amber-400" />
            <span>CHASSIS ALLOY TIERS: WHAT'S GOOD VS BAD?</span>
          </div>
          <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-400/30">
            5 ELITE TIERS
          </span>
        </div>

        <p className="text-slate-300 text-[11px] leading-relaxed">
          Every Position NFT has a <strong className="text-white">Chassis Alloy</strong> procedurally rolled by the smart contract upon minting. It permanently defines your NFT's <strong className="text-amber-300">on-chain SVG plate artwork</strong> and <strong className="text-cyan-300">secondary market collector rarity</strong> (percentages below show baseline odds: 1-day horizon, under 5,000 NARA):
        </p>

        {/* 5 Tiers Breakdown */}
        <div className="space-y-2 pt-0.5">
          {/* Tier 1: 24K Gold - Apex Grail */}
          <div className="p-2.5 sm:p-3 rounded-xl bg-amber-950/60 border border-amber-400/60 space-y-1.5 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
            <div className="flex items-center justify-between">
              <span className="text-amber-300 font-bold text-xs flex items-center gap-1.5 font-mono">
                <span>👑</span>
                <span>TIER 1 · 24K GILDED GOLD</span>
              </span>
              <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-amber-400/25 text-amber-200 uppercase border border-amber-400/50">
                👑 #1 APEX GRAIL (BEST)
              </span>
            </div>
            <p className="text-[11px] text-slate-200 leading-relaxed pl-5 font-sans">
              <strong className="text-white">Solid 24-Karat Aurum Bullion</strong> chassis surrounded by an omnidirectional 360° radiant golden halo, 16-ray solar astrolabe corona, and diamond starburst plasma core. The <strong className="text-amber-300">rarest drop in the protocol (1.0% baseline odds, up to 6.5% whale max)</strong> commanding the undisputed pinnacle of on-chain prestige.
            </p>
          </div>

          {/* Tier 2: Damascus */}
          <div className="p-2.5 sm:p-3 rounded-xl bg-cyan-950/50 border border-cyan-400/50 space-y-1.5 shadow-[0_0_12px_rgba(0,240,255,0.15)]">
            <div className="flex items-center justify-between">
              <span className="text-cyan-300 font-bold text-xs flex items-center gap-1.5 font-mono">
                <span>🌌</span>
                <span>TIER 2 · FORGED DAMASCUS METEORITE</span>
              </span>
              <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-200 uppercase border border-cyan-400/40">
                #2 LEGENDARY
              </span>
            </div>
            <p className="text-[11px] text-slate-200 leading-relaxed pl-5 font-sans">
              <strong className="text-white">Extraterrestrial Meteorite Iron</strong> folded with celestial quantum-blue Damascus wave patterns, glowing cyan pinstripes, and deep space casing (4.0% baseline odds, up to 14.5% whale max).
            </p>
          </div>

          {/* Tier 3: Obsidian Void */}
          <div className="p-2.5 sm:p-3 rounded-xl bg-purple-950/40 border border-purple-500/40 space-y-1.5 shadow-[0_0_12px_rgba(168,85,247,0.15)]">
            <div className="flex items-center justify-between">
              <span className="text-purple-300 font-bold text-xs flex items-center gap-1.5 font-mono">
                <span>🔮</span>
                <span>TIER 3 · OBSIDIAN VOID</span>
              </span>
              <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 uppercase border border-purple-500/40">
                #3 RARE
              </span>
            </div>
            <p className="text-[11px] text-slate-200 leading-relaxed pl-5 font-sans">
              <strong className="text-white">Imperial Amethyst & Obsidian Crystal</strong> with ultraviolet laser trim, royal violet brackets, and deep space void singularity core. High horology luxury violet aesthetic (15.0% baseline odds, up to 22.0% max).
            </p>
          </div>

          {/* Tier 4: Emerald */}
          <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-emerald-300 font-bold text-xs flex items-center gap-1.5 font-mono">
                <span>🟢</span>
                <span>TIER 4 · CYBERNETIC EMERALD</span>
              </span>
              <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase border border-emerald-500/40">
                #4 UNCOMMON
              </span>
            </div>
            <p className="text-[11px] text-slate-200 leading-relaxed pl-5 font-sans">
              <strong className="text-white">Bio-Synthetic Cyber Ceramic</strong> with neon green matrix data lines and illuminated circuitry (30.0% baseline odds, up to 35.0% max).
            </p>
          </div>

          {/* Tier 5: Slate */}
          <div className="p-2.5 sm:p-3 rounded-xl bg-slate-900/60 border border-white/10 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold text-xs flex items-center gap-1.5 font-mono">
                <span>🪙</span>
                <span>TIER 5 · TITANIUM SLATE</span>
              </span>
              <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-white/10 text-slate-300 uppercase border border-white/15">
                #5 COMMON BASELINE
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed pl-5 font-sans">
              <strong className="text-white">Industrial Aerospace Titanium</strong> node casing with cold cobalt accents. The baseline standard-issue terminal (50.0% baseline odds on 1-day lock).
            </p>
          </div>
        </div>

        {/* Grandfathered Gen-0 Relics Note */}
        <div className="p-3 rounded-xl bg-amber-950/25 border border-amber-400/30 text-slate-200 text-[11px] font-sans leading-relaxed space-y-1 mt-2">
          <div className="font-bold text-amber-300 uppercase flex items-center gap-1.5">
            <StarIcon size={14} weight="fill" className="text-amber-400" />
            <span>GEN-0 IMMUTABLE RELICS (TOKENS #1 – #47)</span>
          </div>
          <p>
            • <strong className="text-white">Historical Grandfathering:</strong> Existing minted tokens #1–#47 permanently retain their original rolled chassis identities, rendered with the new luxury horology SVG graphics.
          </p>
          <p>
            • <strong className="text-white">The Apex Gold Relics:</strong> Tokens #10 and #27 are the only 2 Gilded Gold positions minted in Gen-0, reigning as the ultra-exclusive crown jewels of the Genesis fleet.
          </p>
        </div>

        {/* How Rewards & Chassis Alloy Work Together */}
        <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-400/25 text-slate-200 text-[11px] font-sans leading-relaxed space-y-1 mt-2">
          <div className="font-bold text-cyan-300 uppercase flex items-center gap-1.5">
            <ShieldCheck size={14} weight="fill" className="text-cyan-400" />
            <span>HOW DO REWARDS AND ALLOY TIERS WORK TOGETHER?</span>
          </div>
          <p>
            • <strong className="text-white">All active cells earn rewards:</strong> Every NFT slotted into the Fleet Deck captures pulse emissions (ETH & NARA). Your participation weight multiplier (<strong className="text-cyan-300">1.00X – 4.00X</strong>) is determined by your <strong className="text-white">Duration Horizon</strong>.
          </p>
          <p>
            • <strong className="text-white">The 365-Day Commitment Power:</strong> Committing for 365 Days locks in maximum <strong className="text-cyan-300">4.00X Participation Weight</strong> AND grants <strong className="text-cyan-300">+350 Luck</strong>, boosting higher tier pull chances while compressing Common Slate from 50% down to 24%–28%!
          </p>
        </div>
      </div>

      {/* 1. Duration Horizon Luck Mechanics */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-cyan-300 font-bold uppercase text-[11px] tracking-wider">
          <Sparkle size={14} weight="fill" className="text-cyan-400" />
          <span>1. COMMIT HORIZON LUCK MECHANICS</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[11px]">
          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
            <span className="text-slate-300">1 Day Lock:</span>
            <span className="text-slate-400 font-bold">+0 Luck (Baseline)</span>
          </div>
          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
            <span className="text-slate-300">30 Days Lock:</span>
            <span className="text-cyan-300/80 font-bold">+28 Luck</span>
          </div>
          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
            <span className="text-slate-300">90 Days Lock:</span>
            <span className="text-cyan-300/90 font-bold">+86 Luck</span>
          </div>
          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
            <span className="text-slate-300">180 Days Lock:</span>
            <span className="text-cyan-300 font-bold">+172 Luck</span>
          </div>
          <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-400/40 sm:col-span-2 flex items-center justify-between shadow-[0_0_15px_rgba(0,240,255,0.15)]">
            <span className="text-white font-bold">365 Days Lock:</span>
            <span className="text-cyan-300 font-black tracking-wide">+350 MAX LUCK BONUS ⚡</span>
          </div>
        </div>
        <p className="text-[11px] text-cyan-200/90 italic pl-1">
          → Shifts your roll progressively towards Rare, Legendary, and 24K Gold Apex Grail tiers!
        </p>
      </div>

      {/* 2. The 5,000+ NARA Whale Gate */}
      <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-950/40 to-amber-950/20 border border-amber-400/40 space-y-1.5 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
        <div className="flex items-center gap-1.5 text-amber-300 font-bold uppercase text-[11px] tracking-wider">
          <Crown size={15} weight="fill" className="text-amber-400" />
          <span>2. THE 5,000+ NARA WHALE GATE</span>
        </div>
        <p className="text-slate-300 leading-relaxed text-[11px]">
          If you commit <strong className="text-amber-300 font-mono">≥ 5,000 NARA</strong>: The contract unlocks Whale Status, adding a bonus <strong className="text-amber-300">+2.0%</strong> to 24K Gold (up to 6.5%) and <strong className="text-cyan-300">+4.0%</strong> to Damascus (up to 14.5%)!
        </p>
      </div>

      {/* 3. Apex Drop Table */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide block">
          3. APEX COMBO (365 DAYS + ≥ 5,000 NARA):
        </span>
        <div className="space-y-1.5 text-[11px] font-mono">
          <div className="p-2 px-3 rounded-xl bg-amber-950/50 border border-amber-400/40 flex items-center justify-between shadow-[0_0_10px_rgba(245,158,11,0.2)]">
            <span className="text-amber-300 font-bold flex items-center gap-1.5">
              <span>👑</span>
              <span>24K Gilded Gold (Apex Grail)</span>
            </span>
            <span className="text-amber-200 font-black text-xs">6.5% chance</span>
          </div>

          <div className="p-2 px-3 rounded-xl bg-cyan-950/50 border border-cyan-400/40 flex items-center justify-between shadow-[0_0_10px_rgba(0,240,255,0.15)]">
            <span className="text-cyan-300 font-bold flex items-center gap-1.5">
              <span>🌌</span>
              <span>Forged Damascus Meteorite (Legendary)</span>
            </span>
            <span className="text-cyan-200 font-black text-xs">14.5% chance</span>
          </div>

          <div className="p-2 px-3 rounded-xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-between">
            <span className="text-purple-300 font-semibold flex items-center gap-1.5">
              <span>🔮</span>
              <span>Obsidian Void (Rare)</span>
            </span>
            <span className="text-purple-200 font-bold text-xs">22.0% chance</span>
          </div>

          <div className="p-2 px-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
            <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
              <span>🟢</span>
              <span>Cybernetic Emerald (Uncommon)</span>
            </span>
            <span className="text-emerald-200 font-bold text-xs">33.0% chance</span>
          </div>

          <div className="p-2 px-3 rounded-xl bg-slate-900/70 border border-white/10 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5">
              <span>🪙</span>
              <span>Titanium Slate (Common)</span>
            </span>
            <span className="text-slate-300 font-bold text-xs">24.0% chance</span>
          </div>
        </div>
      </div>
    </div>
  );
}

