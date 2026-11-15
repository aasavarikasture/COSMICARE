import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        // COSMICARE accent palette - extended from design tokens
        cosmicare: {
          deepblack: "hsl(220 15% 5%)",
          charcoal: "hsl(220 15% 8%)",
          "near-black": "hsl(220 20% 10%)",
          "warm-ivory": "#f5f0e8",
          offwhite: "#f5f5f0",
          "muted-silver": "hsl(0 0% 65%)",
          "restrained-grey": "hsl(0 0% 52%)",
          "celestial-blue": "hsl(205 25% 60%)",
          "desaturated-cyan": "hsl(195 25% 55%)",
          "dusty-violet": "hsl(270 15% 45%)",
          "soft-amber": "hsl(40 30% 55%)",
          "restrained-red": "#a83739",
          "muted-green": "hsl(100 15% 45%)",
        },
      },
      fontFamily: {
        serif: ["Cormorant Garamond", "DM Serif Display", "serif"],
        sans: ["DM Sans", "Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
