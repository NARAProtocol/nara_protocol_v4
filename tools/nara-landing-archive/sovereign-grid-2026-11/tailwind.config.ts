import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#040508",
        surface: "#090C12",
        card: "rgba(10, 14, 22, 0.75)",
        "card-hover": "rgba(14, 20, 32, 0.9)",
        "base-blue": "#0000FF",
        "base-blue-glow": "rgba(0, 0, 255, 0.35)",
        "nara-cyan": "#00F0FF",
        "nara-gold": "#FFD700",
        "nara-emerald": "#10B981",
        "nara-red": "#FF334B",
        dim: "#8E9AA8",
        muted: "#5A6675",
        silver: "#F4F6F8",
      },
      fontFamily: {
        sans: ['"Inter"', "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ['"Satoshi"', '"Inter"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        label: "0.12em",
        head: "0.08em",
      },
      maxWidth: {
        shell: "1280px",
      },
      boxShadow: {
        glass: "0 20px 40px -10px rgba(0, 0, 0, 0.7), 0 0 25px rgba(0, 82, 255, 0.15)",
        glow: "0 0 35px rgba(0, 82, 255, 0.3)",
        cyan: "0 0 30px rgba(56, 189, 248, 0.25)",
        card: "0 15px 35px -5px rgba(0, 0, 0, 0.6)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.8)" },
        },
        float: {
          "0%": { transform: "translateY(0px) rotate(0deg)" },
          "100%": { transform: "translateY(-10px) rotate(2deg)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        float: "float 4s ease-in-out infinite alternate",
        marquee: "marquee 32s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
