"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  Settings,
  ShieldCheck,
  ChevronsUpDown,
  Search,
  User,
  LogOut,
  Users as UsersIcon,
  Contact,
  Building2,
  CreditCard,
  Receipt,
  KeyRound,
  Mail,
  ScrollText,
  Newspaper,
  SlidersHorizontal,
  Archive,
  ArchiveRestore,
  MessageSquare,
  Headphones,
  AtSign,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { LogoMark } from "@/components/layout/logo-mark";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SiteFavicon } from "@/components/ui/site-favicon";
import {
  useCurrentUser,
  useCan,
  displayName,
  roleLabel,
} from "@/components/providers/user-provider";
import { useProjects } from "@/components/providers/projects-provider";
import { CampaignRequestInput } from "@/components/access/campaign-request-input";
import { CampaignInfo } from "@/components/layout/campaign-info";

export function Sidebar({
  collapsed = false,
  mobileOpen = false,
  onExpand,
  onCloseMobile,
}: {
  collapsed?: boolean;
  mobileOpen?: boolean;
  onExpand?: () => void;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, setUser } = useCurrentUser();
  const can = useCan();
  const { projects, loading: projectsLoading, setArchived } = useProjects();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  // Platform staff the super admin added also get the platform nav — but only the
  // sections their permissions allow (each row is gated by `perm` below).
  const isPlatform = isSuperAdmin || !!user?.isSuperAdminTeam;
  const currentAdminSection = searchParams.get("s") || "overview";
  const [menuOpen, setMenuOpen] = useState(false);

  // Super admin's sidebar is platform-management nav, NOT projects/campaigns.
  // Each section is gated by a platform permission so delegated staff see only theirs.
  const allAdminSections: { key: string; label: string; icon: LucideIcon; href?: string; perm: string }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard, perm: "platform.orgs.view" },
    { key: "team", label: "Team", icon: UsersIcon, href: "/dashboard/admin?s=team", perm: "platform.staff.manage" },
    { key: "support", label: "Support tickets", icon: Headphones, href: "/dashboard/support", perm: "platform.support" },
    { key: "users", label: "Users", icon: UsersIcon, perm: "platform.orgs.view" },
    { key: "orgs", label: "Organizations", icon: Building2, perm: "platform.orgs.view" },
    { key: "plans", label: "Plans", icon: CreditCard, perm: "platform.plans.manage" },
    { key: "transactions", label: "Payments", icon: Receipt, perm: "platform.transactions.view" },
    { key: "gateways", label: "Payment keys", icon: KeyRound, perm: "platform.gateways.manage" },
    { key: "contacts", label: "Contact messages", icon: MessageSquare, perm: "platform.orgs.view" },
    { key: "subscribers", label: "Subscribers", icon: AtSign, perm: "platform.orgs.view" },
    { key: "seo", label: "SEO / head tags", icon: Globe, perm: "platform.settings.manage" },
    { key: "blog", label: "Blog", icon: Newspaper, href: "/dashboard/admin/blog", perm: "platform.settings.manage" },
    { key: "email", label: "Email / SMTP", icon: Mail, perm: "platform.settings.manage" },
    { key: "audit", label: "Audit log", icon: ScrollText, perm: "platform.audit.view" },
    { key: "settings", label: "Settings", icon: SlidersHorizontal, perm: "platform.settings.manage" },
  ];
  // A super admin holds every platform perm; staff see only their granted rows.
  const adminSections = allAdminSections.filter((s) => isSuperAdmin || (user?.permissions ?? []).includes(s.perm));

  async function signOut() {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore — clear locally regardless */
    }
    setUser(null);
    router.replace("/login");
  }

  // The icon-rail only applies on desktop; when the mobile drawer is open we
  // always show the full sidebar with labels.
  const rail = collapsed && !mobileOpen;

  const [query, setQuery] = useState("");
  const [reqOpen, setReqOpen] = useState(false);
  const [archTab, setArchTab] = useState<"active" | "archived">("active");
  const q = query.trim().toLowerCase();
  const activeProjects = projects.filter((p) => !p.archivedAt);
  const archivedProjects = projects.filter((p) => !!p.archivedAt);
  const tabProjects = archTab === "archived" ? archivedProjects : activeProjects;
  const filteredProjects = q
    ? tabProjects.filter((p) => p.name.toLowerCase().includes(q) || p.domain.toLowerCase().includes(q))
    : tabProjects;
  const canArchive = can("projects.edit");

  const accountNav: { label: string; href: string; icon: LucideIcon; soon?: boolean; adminOnly?: boolean }[] = [
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ];

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-[var(--sidebar-width)] flex-col border-r border-sidebar-border bg-sidebar transition-[transform,width] duration-200",
        mobileOpen ? "translate-x-0 shadow-soft" : "-translate-x-full",
        "lg:translate-x-0 lg:shadow-rail",
        collapsed ? "lg:w-[var(--sidebar-collapsed-width)]" : "lg:w-[var(--sidebar-width)]",
      )}
    >
      {/* Brand — the agency's own logo + name (white-label) when set, else the
          platform default (SerpScale logo + styled wordmark). */}
      {(() => {
        const agencyName = user?.branding?.agencyName || null;
        const logo = user?.branding?.logoDataUrl || null;
        const logoBg = user?.branding?.logoBg || null;
        // No agency branding at all → show our own SerpScale brand.
        const isDefault = !agencyName && !logo;
        return (
          <div className={cn("flex h-[var(--topbar-height)] items-center border-b border-border", rail ? "justify-center" : "gap-3 px-5")}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={agencyName ?? "Logo"} className="h-10 w-10 shrink-0 rounded-xl object-contain" style={logoBg ? { backgroundColor: logoBg } : undefined} />
            ) : isDefault ? (
              // Inline mark: swoosh follows the appearance Primary colour, chart
              // follows foreground (black in light / white in dark).
              <LogoMark className="h-10 w-10 shrink-0" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/75 font-heading text-base font-bold text-primary-foreground shadow-glow ring-1 ring-white/10">
                {(agencyName || "S").charAt(0).toUpperCase()}
              </span>
            )}
            {!rail && (
              isDefault ? (
                <span className="truncate text-[24px] leading-none" style={{ letterSpacing: "-0.03em" }}>
                  <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, color: "hsl(var(--primary))" }}>Serp</span><span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontStyle: "italic", color: "hsl(var(--foreground))" }}>Scale</span>
                </span>
              ) : (
                <span className="truncate text-[17px] font-bold text-foreground">{agencyName}</span>
              )
            )}
          </div>
        );
      })()}

      <nav className={cn("flex-1 overflow-y-auto py-2", rail ? "px-2.5" : "px-3")}>
        {isPlatform ? (
          /* Super admin + platform staff: platform-management nav (no projects/campaigns) */
          <div>
            {!rail && (
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Platform</p>
            )}
            <div className="space-y-0.5">
              {adminSections.map((s) => (
                <NavItem
                  key={s.key}
                  label={s.label}
                  href={s.href ?? `/dashboard/admin?s=${s.key}`}
                  icon={s.icon}
                  active={
                    s.href
                      ? pathname.startsWith(s.href)
                      : pathname === "/dashboard/admin" && currentAdminSection === s.key
                  }
                  rail={rail}
                  onNavigate={onCloseMobile}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
        {/* Home */}
        <NavItem
          label="Dashboard"
          href="/dashboard"
          icon={LayoutDashboard}
          active={pathname === "/dashboard"}
          rail={rail}
          onNavigate={onCloseMobile}
        />

        {(can("clients.view_all") || can("clients.view_assigned")) && (
          <NavItem
            label="Clients"
            href="/dashboard/clients"
            icon={Contact}
            active={pathname === "/dashboard/clients" || pathname.startsWith("/dashboard/clients/")}
            rail={rail}
            onNavigate={onCloseMobile}
          />
        )}

        {/* Support agents (users actually granted platform.support) get a direct
            inbox link. NOT via useCan — an org ADMIN passes every perm there, but
            support is a platform role, so gate on the resolved permission set. */}
        {(user?.permissions ?? []).includes("platform.support") && (
          <NavItem
            label="Support tickets"
            href="/dashboard/support"
            icon={Headphones}
            active={pathname.startsWith("/dashboard/support")}
            rail={rail}
            onNavigate={onCloseMobile}
          />
        )}

        {user?.role === "CLIENT" && user?.clientOwner && user?.clientCanManageTeam && (
          <NavItem
            label="My Team"
            href="/dashboard/portal/team"
            icon={UsersIcon}
            active={pathname === "/dashboard/portal/team"}
            rail={rail}
            onNavigate={onCloseMobile}
          />
        )}

        <div className="my-2 border-t border-sidebar-border" />

        {/* Projects */}
        <div>
          {rail ? (
            can("projects.create") && (
              <Link
                href="/dashboard/projects/new"
                title="New project"
                onClick={onCloseMobile}
                className="mb-1 grid h-9 w-full place-items-center rounded-lg text-primary transition-colors hover:bg-primary/10"
              >
                <Plus className="h-4 w-4" />
              </Link>
            )
          ) : (
            <div className="flex items-center justify-between px-3 pb-1.5 pt-1">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {user?.role === "CLIENT" ? "Campaigns" : "Projects"}
                {tabProjects.length > 0 && (
                  <span className="rounded bg-secondary px-1.5 text-[10px] font-semibold text-muted-foreground">
                    {tabProjects.length}
                  </span>
                )}
              </span>
              {can("projects.create") && (
                <Link
                  href="/dashboard/projects/new"
                  aria-label="New project"
                  onClick={onCloseMobile}
                  className="grid h-6 w-6 place-items-center rounded-md text-primary transition-colors hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4" />
                </Link>
              )}
            </div>
          )}

          {/* Project search — filters the list below. Collapsed rail shows a
              compact icon button that expands the sidebar (same spot). */}
          {rail ? (
            <button
              onClick={onExpand}
              title="Search projects"
              className="mb-1 grid h-9 w-full place-items-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:text-foreground"
            >
              <Search className="h-4 w-4" />
            </button>
          ) : (
            <div className="relative mx-1 mb-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects..."
                className="h-9 w-full rounded-full border border-input bg-background pl-4 pr-10 text-[13px] text-foreground shadow-sm transition-shadow placeholder:text-muted-foreground focus-ring hover:shadow-soft"
              />
              <span className="pointer-events-none absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
                <Search className="h-3 w-3" />
              </span>
            </div>
          )}

          {/* Active / Archived segmented toggle (like a filter tab-bar) */}
          {!rail && (activeProjects.length > 0 || archivedProjects.length > 0) && (
            <div className="mx-1 mb-2 flex rounded-xl border border-border bg-secondary/60 p-1">
              {(["active", "archived"] as const).map((t) => {
                const count = t === "archived" ? archivedProjects.length : activeProjects.length;
                return (
                  <button
                    key={t}
                    onClick={() => setArchTab(t)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold capitalize transition-all",
                      archTab === t
                        ? "bg-primary text-primary-foreground shadow-glow"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t}
                    {count > 0 && (
                      <span
                        className={cn(
                          "text-[11px]",
                          archTab === t ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {projectsLoading ? (
            // Mirrors a real project row (favicon + name + domain) so the list
            // doesn't jump when it loads. Widths vary per row to feel natural.
            <div className="space-y-0.5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "flex rounded-lg",
                    rail ? "justify-center p-1" : "items-center gap-3 py-2 pl-2.5 pr-2.5",
                  )}
                  style={{ opacity: 1 - i * 0.15 }}
                >
                  <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                  {!rail && (
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 rounded-full" style={{ width: `${68 - (i % 3) * 12}%` }} />
                      <Skeleton className="h-2.5 rounded-full" style={{ width: `${48 - (i % 2) * 10}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            !rail &&
            (can("projects.create") ? (
              <Link
                href="/dashboard/projects/new"
                onClick={onCloseMobile}
                className="mx-1 mt-1 flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-5 text-center transition-colors hover:border-ring/40 hover:bg-secondary/60"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-muted-foreground">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-xs font-medium text-foreground">Create a project</span>
                <span className="text-[11px] text-muted-foreground">Add a site to track</span>
              </Link>
            ) : (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No campaigns yet.</p>
            ))
          ) : filteredProjects.length === 0 ? (
            !rail && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {q
                  ? "No projects match your search."
                  : archTab === "archived"
                    ? "No archived campaigns."
                    : "No active campaigns."}
              </p>
            )
          ) : (
            <div className="space-y-0.5">
              {filteredProjects.map((p) => {
                const href = `/dashboard/projects/${p.slug}`;
                const active = pathname === href || pathname.startsWith(`${href}/`) || pathname === `/dashboard/projects/${p.id}`;
                const isArchived = !!p.archivedAt;
                return (
                  <div key={p.id} className="group relative">
                    <Link
                      href={href}
                      title={rail ? p.name : undefined}
                      onClick={onCloseMobile}
                      className={cn(
                        "relative flex rounded-lg transition-colors",
                        rail ? "justify-center p-1" : "items-center gap-3 py-2 pl-2.5 pr-2.5",
                        // Always leave room for the persistent info icon; widen on
                        // hover when the archive button also slides in.
                        !rail && "pr-9",
                        !rail && canArchive && "group-hover:pr-14",
                        active ? "bg-primary/10" : "hover:bg-secondary",
                        isArchived && "opacity-70",
                      )}
                    >
                      {active && !rail && (
                        <span className="glow-pulse absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary shadow-glow" />
                      )}
                      <SiteFavicon domain={p.domain} className="h-9 w-9 shrink-0 transition-transform duration-200 group-hover:scale-105" iconClassName="h-[18px] w-[18px]" />
                      {!rail && (
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-[15px]",
                              active ? "font-semibold text-foreground" : "font-medium text-foreground",
                            )}
                          >
                            {p.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{p.domain}</span>
                        </span>
                      )}
                    </Link>
                    {!rail && (
                      <>
                        {/* Archive / restore — hover-only, sits just left of info */}
                        {canArchive && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void setArchived(p.id, !isArchived);
                            }}
                            title={isArchived ? "Restore campaign" : "Archive campaign"}
                            aria-label={isArchived ? "Restore campaign" : "Archive campaign"}
                            className="absolute right-8 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 shadow-sm transition-all pointer-events-none hover:bg-card hover:text-primary group-hover:pointer-events-auto group-hover:opacity-100"
                          >
                            {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {/* Info card trigger — always visible, one per campaign */}
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                          <CampaignInfo projectId={p.id} projectName={p.name} />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Request access to a campaign by website (members who don't see everything) */}
          {!rail && user?.role !== "CLIENT" && !can("projects.view") && (
            <div className="mt-1.5 px-1">
              {reqOpen ? (
                <div className="rounded-lg border border-border bg-card p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Request a campaign</span>
                    <button onClick={() => setReqOpen(false)} className="text-muted-foreground hover:text-foreground"><span className="text-xs">Close</span></button>
                  </div>
                  <CampaignRequestInput compact onDone={() => setReqOpen(false)} />
                </div>
              ) : (
                <button
                  onClick={() => setReqOpen(true)}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> Request campaign access
                </button>
              )}
            </div>
          )}
        </div>
          </>
        )}

        <div className="my-2 border-t border-sidebar-border" />

        {/* Account */}
        <div>
          {!rail && (
            <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Account
            </p>
          )}
          <div className="space-y-0.5">
            {accountNav
              .filter((i) => !i.adminOnly || isSuperAdmin)
              .map((item) => (
                <NavItem
                  key={item.label}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  soon={item.soon}
                  active={item.href !== "#" && (pathname === item.href || pathname.startsWith(item.href + "/"))}
                  rail={rail}
                  onNavigate={onCloseMobile}
                />
              ))}
          </div>
        </div>
      </nav>

      {/* Profile card + account menu */}
      <div className={cn("relative border-t border-sidebar-border", rail ? "p-2.5" : "p-3")}>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className={cn("absolute z-50 mb-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg", rail ? "bottom-full left-2.5 w-48" : "bottom-full left-3 right-3")}>
              <div className="border-b border-border px-3 py-2">
                <div className="truncate text-sm font-medium">{displayName(user)}</div>
                <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
              </div>
              <Link href="/dashboard/settings/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary">
                <User className="h-4 w-4 text-muted-foreground" /> Profile
              </Link>
              <Link href="/dashboard/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary">
                <Settings className="h-4 w-4 text-muted-foreground" /> Settings
              </Link>
              <button onClick={signOut} className="flex w-full items-center gap-2.5 border-t border-border px-3 py-2 text-sm text-destructive hover:bg-destructive/5">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          title={rail ? displayName(user) : undefined}
          className={cn(
            "flex w-full items-center text-left transition-colors",
            rail
              ? "justify-center rounded-lg p-1 hover:bg-secondary"
              : "gap-3 rounded-xl border border-border bg-card p-2 shadow-soft hover:border-input hover:shadow-elevated",
          )}
        >
          <UserAvatar src={user?.avatarUrl} className="h-9 w-9" />
          {!rail && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {displayName(user)}
                </span>
                <span className="mt-0.5 block">
                  <Badge variant={isSuperAdmin ? "primary" : "default"} className="px-1.5 py-0 text-[10px]">
                    {roleLabel(user?.role)}
                  </Badge>
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  label,
  href,
  icon: Icon,
  soon,
  active,
  rail,
  onNavigate,
}: {
  label: string;
  href: string;
  icon: LucideIcon;
  soon?: boolean;
  active: boolean;
  rail?: boolean;
  onNavigate?: () => void;
}) {
  const base = cn(
    "group relative flex items-center rounded-lg transition-colors",
    rail ? "justify-center p-1" : "gap-3 px-2.5 py-2",
  );
  // Vertical accent bar on the active row (like a raised tab indicator).
  const indicator = active && !rail && (
    <span className="glow-pulse absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary shadow-glow" />
  );
  const chip = (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-all duration-200 group-hover:-translate-y-px group-hover:scale-105",
        active
          ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-glow group-hover:shadow-glow-lg"
          : "border border-border bg-card text-muted-foreground shadow-sm group-hover:border-input group-hover:text-foreground group-hover:shadow-soft",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
  const text = !rail && (
    <span
      className={cn(
        "flex-1 truncate text-[15px]",
        active ? "font-semibold text-foreground" : "font-medium text-foreground",
      )}
    >
      {label}
    </span>
  );

  if (soon) {
    return (
      <span className={cn(base, "cursor-default opacity-60")} title={rail ? label : undefined}>
        {indicator}
        {chip}
        {text}
        {!rail && (
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Soon
          </span>
        )}
      </span>
    );
  }
  return (
    <Link
      href={href}
      title={rail ? label : undefined}
      onClick={onNavigate}
      className={cn(base, active ? "bg-primary/10" : "hover:bg-secondary")}
    >
      {indicator}
      {chip}
      {text}
    </Link>
  );
}
