import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { THEME_MODE_KEY, THEME_STORAGE_KEY, THEME_VERSION, THEME_VERSION_KEY } from "@/components/theme/theme-config";

export const metadata: Metadata = {
  title: "SerpScale",
  description: "Own your SEO data - keyword research, rank tracking, backlinks, audits.",
};

// Applies the saved theme + mode before first paint so there is no flash of the
// default look while React hydrates.
const noFlashScript = `
(function(){
  try {
    // Theme is dashboard-only — never pre-paint it on the sign-in form / marketing.
    if (location.pathname.indexOf('/dashboard') !== 0) return;
    var mode = localStorage.getItem('${THEME_MODE_KEY}');
    if (mode === 'dark') document.documentElement.classList.add('dark');
    var raw = localStorage.getItem('${THEME_STORAGE_KEY}');
    // One-time migration: drop stale font overrides so the new premium default
    // fonts apply everywhere (keep custom colours). Runs once per browser.
    if (localStorage.getItem('${THEME_VERSION_KEY}') !== '${THEME_VERSION}') {
      if (raw) {
        try { var m = JSON.parse(raw); delete m['font-sans']; delete m['font-heading']; raw = JSON.stringify(m); localStorage.setItem('${THEME_STORAGE_KEY}', raw); } catch (e) {}
      }
      localStorage.setItem('${THEME_VERSION_KEY}', '${THEME_VERSION}');
    }
    if (raw) {
      var o = JSON.parse(raw);
      for (var k in o) document.documentElement.style.setProperty('--' + k, o[k]);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/* Premium type: Space Grotesk (headings) + Plus Jakarta Sans (body), plus
            the other theme font options so the Appearance customizer can switch live. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Sora:wght@400;500;600;700&family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,600;1,700&family=Montserrat:ital,wght@0,700;0,800;0,900;1,800&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster position="top-right" richColors closeButton toastOptions={{ style: { borderRadius: "0.75rem" } }} />
      </body>
    </html>
  );
}
