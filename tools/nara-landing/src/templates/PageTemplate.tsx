import { Layout, ContractPill } from "../components";

/**
 * Standard NARA Protocol Page Template
 * 
 * Whenever a "new page" is requested, use this template:
 * - Automatic Sovereign Grid 3D Background with depth vignette
 * - Standard Architectural Header with Chart, Explorer, & Vision Modal
 * - Standard Floating Telemetry Glass Dock Footer with MetaMask Add Token, Socials, GitHub Docs, Legals, & Live 15-Min Pulse
 * - Reusable ContractPill for explicit $NARA token contract display & copy (matching .btn-ticks HUD brackets)
 */
export default function PageTemplate() {
  return (
    <Layout>
      {/* Standard Content Section — High-DPI mobile positioning & responsive desktop centering */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-10 md:px-12 flex-1 flex flex-col justify-start sm:justify-center pt-7 sm:pt-0 -translate-y-0 sm:-translate-y-8 md:-translate-y-12">
        <div className="max-w-2xl space-y-4 sm:space-y-6">
          
          {/* Example Page Title */}
          <div className="space-y-2 font-mono">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-[0.14em] uppercase">
              PAGE TITLE
            </h1>
            <p className="text-xs sm:text-sm font-bold text-cyan-300 tracking-wider uppercase">
              PAGE SUBHEAD OR DESCRIPTION
            </p>
          </div>

          {/* Tactical HUD Buttons & Contract Info */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-2">
            <button className="btn-ticks primary">
              <span className="corner tl"></span>
              <span className="corner tr"></span>
              <span className="corner bl"></span>
              <span className="corner br"></span>
              PRIMARY ACTION
            </button>

            <button className="btn-ticks">
              <span className="corner tl"></span>
              <span className="corner tr"></span>
              <span className="corner bl"></span>
              <span className="corner br"></span>
              SECONDARY ACTION
            </button>

            {/* Tactical HUD $NARA Contract Pill */}
            <ContractPill />
          </div>

        </div>
      </main>
    </Layout>
  );
}
