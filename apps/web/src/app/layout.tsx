import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { THEME_MODE_KEY, THEME_STORAGE_KEY } from "@/components/theme/theme-config";

export const metadata: Metadata = {
  title: "SEO Platform",
  description: "Own your SEO data - keyword research, rank tracking, backlinks, audits.",
};

// Applies the saved theme + mode before first paint so there is no flash of the
// default look while React hydrates.
const noFlashScript = `
(function(){
  try {
    var mode = localStorage.getItem('${THEME_MODE_KEY}');
    if (mode === 'dark') document.documentElement.classList.add('dark');
    var raw = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (raw) {
      var o = JSON.parse(raw);
      for (var k in o) document.documentElement.style.setProperty('--' + k, o[k]);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
