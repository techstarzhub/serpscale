import { RedirectIfAuthed } from "@/components/providers/redirect-if-authed";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel - dark neutral, hidden on small screens */}
      <div className="relative hidden flex-col justify-between bg-foreground p-12 text-background lg:flex">
        <div className="flex items-center gap-2.5 text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary font-heading text-primary-foreground shadow-sm">
            S
          </span>
          SEO Platform
        </div>

        <div className="space-y-4">
          <h2 className="font-heading text-4xl font-semibold leading-tight">
            Own your SEO data.
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-background/70">
            Keyword research, rank tracking, backlinks, and site audits - built on
            data you crawl and control, not rented from anyone.
          </p>
          <ul className="space-y-2.5 pt-2 text-sm text-background/80">
            {["Keyword research", "Rank tracking", "Backlink index", "Site audits"].map(
              (f) => (
                <li key={f} className="flex items-center gap-2.5">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-background/15 text-[11px]">
                    &#10003;
                  </span>
                  {f}
                </li>
              ),
            )}
          </ul>
        </div>

        <p className="text-xs text-background/50">
          &copy; {new Date().getFullYear()} SEO Platform
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <RedirectIfAuthed>{children}</RedirectIfAuthed>
        </div>
      </div>
    </div>
  );
}
