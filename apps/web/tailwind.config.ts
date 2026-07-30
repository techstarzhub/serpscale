import type { Config } from "tailwindcss";

// Every color / radius / font here points at a CSS variable defined in
// globals.css. Components never hardcode a value - they use these tokens, and the
// ThemeProvider can override any variable at runtime from the user's saved theme.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        "chart-1": "hsl(var(--chart-1))",
        "chart-2": "hsl(var(--chart-2))",
        "chart-3": "hsl(var(--chart-3))",
        "chart-4": "hsl(var(--chart-4))",
        "chart-5": "hsl(var(--chart-5))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-heading)"],
      },
      boxShadow: {
        card: "0 1px 2px 0 hsl(224 30% 12% / 0.04), 0 2px 6px -1px hsl(224 30% 12% / 0.06)",
        soft: "0 4px 16px -2px hsl(224 30% 12% / 0.08)",
        // Deeper ambient lift for elevated chrome (topbar, popovers, profile card).
        elevated: "0 2px 4px -1px hsl(224 30% 12% / 0.06), 0 8px 24px -6px hsl(224 30% 12% / 0.12)",
        // Right-edge depth so the sidebar reads as a raised panel over the canvas.
        rail: "8px 0 24px -14px hsl(224 30% 12% / 0.22)",
        // Brand-coloured glow for the primary call-to-action — follows the theme.
        glow: "0 6px 16px -4px hsl(var(--primary) / 0.45)",
        "glow-lg": "0 10px 28px -6px hsl(var(--primary) / 0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
