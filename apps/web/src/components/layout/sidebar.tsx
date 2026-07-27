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
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
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
  const { projects, loading: projectsLoading } = useProjects();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const currentAdminSection = searchParams.get("s") || "overview";
  const [menuOpen, setMenuOpen] = useState(false);

  // Super admin's sidebar is platform-management nav, NOT projects/campaigns.
  const adminSections: { key: string; label: string; icon: LucideIcon }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "users", label: "Users", icon: UsersIcon },
    { key: "orgs", label: "Organizations", icon: Building2 },
    { key: "plans", label: "Plans", icon: CreditCard },
    { key: "transactions", label: "Payments", icon: Receipt },
    { key: "gateways", label: "Payment keys", icon: KeyRound },
    { key: "email", label: "Email / SMTP", icon: Mail },
    { key: "audit", label: "Audit log", icon: ScrollText },
    { key: "settings", label: "Settings", icon: SlidersHorizontal },
  ];

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
  const q = query.trim().toLowerCase();
  const filteredProjects = q
    ? projects.filter((p) => p.name.toLowerCase().includes(q) || p.domain.toLowerCase().includes(q))
    : projects;

  const accountNav: { label: string; href: string; icon: LucideIcon; soon?: boolean; adminOnly?: boolean }[] = [
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ];

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-[var(--sidebar-width)] flex-col border-r border-sidebar-border bg-sidebar transition-[transform,width] duration-200",
        mobileOpen ? "translate-x-0 shadow-soft" : "-translate-x-full",
        "lg:translate-x-0 lg:shadow-none",
        collapsed ? "lg:w-[var(--sidebar-collapsed-width)]" : "lg:w-[var(--sidebar-width)]",
      )}
    >
      {/* Brand — the agency's own logo + name (white-label) when set, else platform default */}
      {(() => {
        const agencyName = user?.branding?.agencyName || null;
        const logo = user?.branding?.logoDataUrl || null;
        const logoBg = user?.branding?.logoBg || null;
        const brandName = agencyName || "SEO Platform";
        return (
          <div className={cn("flex h-[var(--topbar-height)] items-center", rail ? "justify-center" : "gap-2.5 px-5")}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={brandName}
                className="h-8 w-8 shrink-0 rounded-lg object-contain"
                style={logoBg ? { backgroundColor: logoBg } : undefined}
              />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground shadow-sm">
                {brandName.charAt(0).toUpperCase()}
              </span>
            )}
            {!rail && <span className="truncate text-[15px] font-semibold text-foreground">{brandName}</span>}
          </div>
        );
      })()}

      {/* Search */}
      <div className={cn("pb-2 pt-1", rail ? "px-2.5" : "px-3")}>
        {rail ? (
          <button
            onClick={onExpand}
            title="Search projects"
            className="grid h-9 w-full place-items-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects..."
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-ring"
            />
          </div>
        )}
      </div>

      <nav className={cn("flex-1 overflow-y-auto py-2", rail ? "px-2.5" : "px-3")}>
        {isSuperAdmin ? (
          /* Super admin: platform-management nav (no projects/campaigns) */
          <div>
            {!rail && (
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Platform</p>
            )}
            <div className="space-y-0.5">
              {adminSections.map((s) => (
                <NavItem
                  key={s.key}
                  label={s.label}
                  href={`/dashboard/admin?s=${s.key}`}
                  icon={s.icon}
                  active={pathname === "/dashboard/admin" && currentAdminSection === s.key}
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

        {user?.role === "CLIENT" && user?.clientOwner && (
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
                {projects.length > 0 && (
                  <span className="rounded bg-secondary px-1.5 text-[10px] font-semibold text-muted-foreground">
                    {projects.length}
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

          {projectsLoading ? (
            <div className="space-y-0.5">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "flex rounded-lg",
                    rail ? "justify-center p-1" : "items-center gap-2.5 px-2.5 py-1.5",
                  )}
                >
                  <Skeleton className="h-7 w-7 rounded-md" />
                  {!rail && (
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2 w-16" />
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
            !rail && <p className="px-3 py-2 text-xs text-muted-foreground">No projects match your search.</p>
          ) : (
            <div className="space-y-0.5">
              {filteredProjects.map((p) => {
                const href = `/dashboard/projects/${p.slug}`;
                const active = pathname === href || pathname.startsWith(`${href}/`) || pathname === `/dashboard/projects/${p.id}`;
                return (
                  <Link
                    key={p.id}
                    href={href}
                    title={rail ? p.name : undefined}
                    onClick={onCloseMobile}
                    className={cn(
                      "flex rounded-lg transition-colors",
                      rail ? "justify-center p-1" : "items-center gap-2.5 px-2.5 py-1.5",
                      active ? "bg-secondary" : "hover:bg-secondary",
                    )}
                  >
                    <SiteFavicon domain={p.domain} className="h-7 w-7" iconClassName="h-3.5 w-3.5" />
                    {!rail && (
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm",
                            active ? "font-semibold text-foreground" : "font-medium text-foreground",
                          )}
                        >
                          {p.name}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">{p.domain}</span>
                      </span>
                    )}
                  </Link>
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
              : "gap-3 rounded-xl border border-border bg-secondary/40 p-2 hover:bg-secondary",
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
    "group flex items-center rounded-lg transition-colors",
    rail ? "justify-center p-1" : "gap-2.5 px-2.5 py-1.5",
  );
  const chip = (
    <span
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "border border-border bg-card text-muted-foreground group-hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
  const text = !rail && (
    <span
      className={cn(
        "flex-1 truncate text-sm",
        active ? "font-semibold text-foreground" : "font-medium text-foreground",
      )}
    >
      {label}
    </span>
  );

  if (soon) {
    return (
      <span className={cn(base, "cursor-default opacity-60")} title={rail ? label : undefined}>
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
      className={cn(base, active ? "bg-secondary" : "hover:bg-secondary")}
    >
      {chip}
      {text}
    </Link>
  );
}
