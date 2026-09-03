import Header from "./components/Header";
import HeroReticle from "./components/HeroReticle";
import LiveTelemetry from "./components/LiveTelemetry";
import PrimitivesGrid from "./components/PrimitivesGrid";
import Footer from "./components/Footer";

export default function App() {
  return (
    <div className="min-h-screen bg-void text-silver font-sans selection:bg-base-blue/40 selection:text-white flex flex-col justify-between relative overflow-x-hidden">
      {/* Top Swiss Status Ribbon */}
      <Header />

      {/* Main Narrative Monolith */}
      <main className="flex-1 flex flex-col">
        {/* The Centerpiece: Hero Reticle with Interactive NARA Face */}
        <HeroReticle />

        {/* Live Base RPC Telemetry & 1-Click Contract Copy */}
        <LiveTelemetry />

        {/* Three Immutable Primitives (Hook, Engine, Range) */}
        <PrimitivesGrid />
      </main>

      {/* Minimalist Terminal Footer */}
      <Footer />
    </div>
  );
}
