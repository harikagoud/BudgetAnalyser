import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Accent ramp: slot 1 of the validated categorical palette (#2a78d6)
        // plus its sequential-blue neighbors, so UI chrome and chart marks
        // share one hue.
        brand: {
          50: "#eef5fd",
          100: "#cde2fb",
          500: "#2a78d6",
          600: "#256abf",
          700: "#1c5cab",
        },
      },
    },
  },
  plugins: [],
};
export default config;
