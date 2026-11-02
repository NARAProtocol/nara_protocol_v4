import React from "react";
import Header, { HeaderProps } from "./Header";
import Footer, { FooterProps } from "./Footer";

export interface LayoutProps {
  children: React.ReactNode;
  className?: string;
  headerProps?: HeaderProps;
  footerProps?: FooterProps;
  showBackground?: boolean;
}

export default function Layout({
  children,
  className = "",
  headerProps,
  footerProps,
  showBackground = true,
}: LayoutProps) {
  return (
    <div className={`relative w-full min-h-[100dvh] overflow-x-hidden bg-[#02050b] text-white font-sans select-none flex flex-col justify-between ${className}`}>
      {/* 1. Cinematic 3D Sovereign Grid Background with Depth Vignette */}
      {showBackground && (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <img
            src="/nara_sovereign_grid_clean_master_1920.png"
            alt="NARA Sovereign Grid"
            className="w-full h-full object-cover object-center scale-100"
          />
          <div className="absolute inset-0 bg-radial-vignette pointer-events-none opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/75 pointer-events-none" />
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-black/70 via-black/35 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-[#02050b]/35 pointer-events-none" />
        </div>
      )}

      {/* 2. Architectural Reusable Header */}
      <Header {...headerProps} />

      {/* 3. Page Content */}
      <div className="relative z-10 flex-1 flex flex-col pb-24 md:pb-6">
        {children}
      </div>

      {/* 4. Telemetry Glass Dock Footer */}
      <Footer {...footerProps} />
    </div>
  );
}
