// The list of tokens a user can customize. This drives the appearance settings
// UI and is the contract for what "themeable" means. Adding a token here makes it
// editable everywhere - no other change needed. Defaults live in globals.css; this
// only declares WHAT can be changed and how to edit it.

export type TokenType = "color" | "size" | "font";

export interface ThemeToken {
  key: string; // CSS variable name without the leading "--"
  label: string;
  type: TokenType;
  group: string;
}

export const THEME_TOKENS: ThemeToken[] = [
  // Brand
  { key: "primary", label: "Primary", type: "color", group: "Brand" },
  { key: "primary-foreground", label: "Primary text", type: "color", group: "Brand" },
  { key: "ring", label: "Focus ring", type: "color", group: "Brand" },

  // Surfaces
  { key: "background", label: "Background", type: "color", group: "Surfaces" },
  { key: "foreground", label: "Text", type: "color", group: "Surfaces" },
  { key: "card", label: "Card", type: "color", group: "Surfaces" },
  { key: "card-foreground", label: "Card text", type: "color", group: "Surfaces" },
  { key: "muted", label: "Muted", type: "color", group: "Surfaces" },
  { key: "muted-foreground", label: "Muted text", type: "color", group: "Surfaces" },
  { key: "border", label: "Border", type: "color", group: "Surfaces" },

  // Sidebar
  { key: "sidebar", label: "Sidebar", type: "color", group: "Sidebar" },
  { key: "sidebar-foreground", label: "Sidebar text", type: "color", group: "Sidebar" },

  // Status
  { key: "destructive", label: "Danger", type: "color", group: "Status" },
  { key: "success", label: "Success", type: "color", group: "Status" },

  // Shape and type
  { key: "radius", label: "Corner radius", type: "size", group: "Shape and type" },
  { key: "font-sans", label: "Body font", type: "font", group: "Shape and type" },
  { key: "font-heading", label: "Heading font", type: "font", group: "Shape and type" },
];

export const FONT_OPTIONS = [
  { label: "Geist", value: "var(--font-geist-sans), system-ui, sans-serif" },
  { label: "Plus Jakarta Sans", value: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { label: "Space Grotesk", value: "'Space Grotesk', system-ui, sans-serif" },
  { label: "Sora", value: "'Sora', system-ui, sans-serif" },
  { label: "Inter", value: "'Inter', system-ui, sans-serif" },
  { label: "Poppins", value: "'Poppins', system-ui, sans-serif" },
  { label: "System", value: "system-ui, -apple-system, sans-serif" },
  { label: "Georgia (serif)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "'JetBrains Mono', ui-monospace, monospace" },
];

// A user's saved overrides: token key -> raw CSS value.
export type ThemeOverrides = Record<string, string>;

export const THEME_STORAGE_KEY = "seo-platform-theme";
export const THEME_MODE_KEY = "seo-platform-theme-mode";
// Bump when the built-in defaults change (e.g. fonts). On a version mismatch we
// drop any stale font override from a user's saved theme so the new premium
// defaults apply everywhere — while keeping their custom colours.
export const THEME_VERSION = "3";
export const THEME_VERSION_KEY = "seo-platform-theme-version";
export type ThemeMode = "light" | "dark";
