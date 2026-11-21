/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./vault.html", "./public/404.html", "./src/meme/**/*.js"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        naraGreen: "#39FF14",
        baseBlue: "#0052FF",
        hazardRed: "#FF2A2A",
      },
    },
  },
  plugins: [],
};
