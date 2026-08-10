"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useCurrentUser, useCan, useLimit } from "@/components/providers/user-provider";
import { api } from "@/lib/api";

// Live completion checks: a step only counts as done once the real thing exists.
// "increase" = something new was created during the tour (baseline captured on
// entry); "truthy" = a value is now configured. Polled every ~2s.
type StepCheck = { get: () => Promise<number>; mode: "increase" | "truthy"; wait: string; done: string };
const CHECKS: Record<string, StepCheck> = {
  roles: { get: async () => (await api.get<any[]>("/team/roles")).length, mode: "increase", wait: "Create a role to finish this step", done: "Role created!" },
  members: { get: async () => (await api.get<any[]>("/team/members")).length, mode: "increase", wait: "Invite a teammate to finish this step", done: "Teammate invited!" },
  integrations: { get: async () => { const s = await api.get<any>("/integrations").catch(() => null); return s?.googleAccounts?.length ?? 0; }, mode: "truthy", wait: "Connect a Google account to finish this step", done: "Google connected!" },
  project: { get: async () => (await api.get<any[]>("/projects")).length, mode: "increase", wait: "Create a project to finish this step", done: "Project created!" },
};

interface Step { key: string; route: string; anchor?: string; selector?: string; pulse?: string; title: string; body: string }

// The exact element a step highlights: an explicit CSS selector, or a data-tour anchor.
const targetSelector = (s: Step): string | null => s.selector ?? (s.anchor ? `[data-tour="${s.anchor}"]` : null);
// A settings-nav tab link, targeted by its route (no extra anchors needed).
const navSel = (p: string) => `[data-tour="settings-nav"] a[href="/dashboard/settings/${p}"]`;

const tourKey = (id: string) => `quicktour:${id}`;

// Theme the driver.js popover to match the app (light/dark), no gradients.
const TOUR_CSS = `
.driver-popover.qt{background:hsl(var(--card));color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-radius:16px;box-shadow:0 24px 60px -15px rgba(0,0,0,.45);max-width:346px;min-width:290px;padding:18px;font-family:inherit}
.driver-popover.qt .driver-popover-title{font-size:16px;font-weight:600;line-height:1.35;color:hsl(var(--foreground));font-family:inherit}
.driver-popover.qt .driver-popover-description{color:hsl(var(--muted-foreground));font-size:13.5px;line-height:1.55;margin-top:6px}
.driver-popover.qt .driver-popover-close-btn{color:hsl(var(--muted-foreground));font-size:22px;width:34px;height:30px}
.driver-popover.qt .driver-popover-close-btn:hover{color:hsl(var(--foreground))}
.driver-popover.qt .driver-popover-footer{margin-top:16px;gap:8px}
.driver-popover.qt .driver-popover-footer-btn{background:hsl(var(--secondary));color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-radius:9px;padding:7px 14px;font-size:13px;font-weight:600;text-shadow:none;transition:filter .15s ease,background .15s ease}
.driver-popover.qt .driver-popover-footer-btn:hover{filter:brightness(.97)}
.driver-popover.qt .driver-popover-next-btn{background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-color:transparent}
.driver-popover.qt .driver-popover-prev-btn{background:transparent;border-color:transparent;color:hsl(var(--muted-foreground))}
.driver-popover.qt .driver-popover-arrow-side-left{border-left-color:hsl(var(--card))}
.driver-popover.qt .driver-popover-arrow-side-right{border-right-color:hsl(var(--card))}
.driver-popover.qt .driver-popover-arrow-side-top{border-top-color:hsl(var(--card))}
.driver-popover.qt .driver-popover-arrow-side-bottom{border-bottom-color:hsl(var(--card))}
.qt-badge{display:inline-block;font-size:11px;font-weight:600;color:hsl(var(--primary));background:hsl(var(--primary) / .12);padding:2px 10px;border-radius:999px;margin-bottom:9px}
.qt-status{display:flex;align-items:center;gap:8px;margin-top:13px;padding:9px 12px;border-radius:11px;font-size:12.5px;font-weight:600}
.qt-wait{background:hsl(var(--chart-3) / .14);color:hsl(var(--chart-3))}
.qt-done{background:hsl(var(--chart-2) / .14);color:hsl(var(--chart-2))}
.qt-spin{width:13px;height:13px;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;animation:qt-spin .7s linear infinite;display:inline-block}
@keyframes qt-spin{to{transform:rotate(360deg)}}
.qt-pulse{position:relative;border-radius:10px!important;animation:qt-pulse 1.5s ease-out infinite;z-index:1}
@keyframes qt-pulse{0%{box-shadow:0 0 0 0 hsl(var(--primary) / .55)}70%{box-shadow:0 0 0 12px hsl(var(--primary) / 0)}100%{box-shadow:0 0 0 0 hsl(var(--primary) / 0)}}
`;

/** First-login gate: after the onboarding wizard, offer a short permission-aware
 *  guided setup — once per user (localStorage), never for super admins, and
 *  force-replayable via ?tour=1 for testing. */
export function QuickTourGate() {
  const { user, loading } = useCurrentUser();
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    if (loading) return;
    const forced = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tour") === "1";
    const gated = !user || (!user.onboardedAt && !forced) || user.role === "SUPER_ADMIN";
    if (gated) { setSeen(true); setReady(true); return; }
    let s = true;
    try { s = !forced && localStorage.getItem(tourKey(user!.id)) === "done"; } catch { s = false; }
    setSeen(s);
    setReady(true);
  }, [user, loading]);

  if (!ready || !user || seen) return null;
  return (
    <QuickTour
      onClose={() => {
        try { localStorage.setItem(tourKey(user.id), "done"); } catch { /* ignore */ }
        setSeen(true);
      }}
    />
  );
}

function QuickTour({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const can = useCan();
  const limit = useLimit();

  const seatsLimit = limit("seats");
  const multiSeat = seatsLimit == null || seatsLimit > 1;
  const cClients = can("clients.view_all") || can("clients.view_assigned");
  const gRoles = can("roles.manage") && multiSeat;
  const gMembers = can("team.manage") && multiSeat;
  const gIntegrations = can("integrations.manage");
  const gProject = can("projects.create");
  const gBilling = can("billing.view");
  const gSettings = can("settings.manage");
  const gTeamView = can("team.view");
  const gTeamManage = can("team.manage");

  const steps = useMemo<Step[]>(() => {
    const all: (Step & { show: boolean })[] = [
      { key: "dashboard", route: "/dashboard", title: "Welcome to your dashboard", body: "This whole page is your home base — a live overview of every campaign’s rankings, traffic, clicks and site-health. Let’s set up the essentials.", show: true },
      { key: "clients", route: "/dashboard", anchor: "nav-clients", title: "Manage your clients", body: "Group campaigns under a client and give them their own branded, read-only portal to follow progress.", show: cClients },
      // Walk each Settings tab (all on the settings page — just highlight the nav item).
      { key: "t-profile", route: "/dashboard/settings/profile", selector: navSel("profile"), title: "Profile", body: "Update your name, email and profile photo — how you appear across the app.", show: true },
      { key: "t-notifications", route: "/dashboard/settings/profile", selector: navSel("notifications"), title: "Notifications", body: "Choose exactly which alerts you receive, in-app and by email.", show: true },
      { key: "t-appearance", route: "/dashboard/settings/profile", selector: navSel("appearance"), title: "Appearance", body: "Switch light or dark mode and pick your accent colour and font.", show: true },
      { key: "t-security", route: "/dashboard/settings/profile", selector: navSel("security"), title: "Security", body: "Change your password and review where you’re currently signed in.", show: true },
      { key: "t-access", route: "/dashboard/settings/profile", selector: navSel("access"), title: "Request access", body: "Ask an admin for extra permissions whenever you need them.", show: true },
      { key: "t-billing", route: "/dashboard/settings/profile", selector: navSel("billing"), title: "Billing", body: "See your plan and keyword limit, download invoices and upgrade anytime.", show: gBilling },
      { key: "t-integrations", route: "/dashboard/settings/profile", selector: navSel("integrations"), title: "Integrations", body: "Connect Google (Search Console & Analytics) — the source of your real data.", show: gIntegrations },
      { key: "t-agency", route: "/dashboard/settings/profile", selector: navSel("agency"), title: "Agency", body: "Set your logo and agency name to white-label the whole workspace.", show: gSettings },
      { key: "t-email", route: "/dashboard/settings/profile", selector: navSel("email"), title: "Email (SMTP)", body: "Send invites and client reports from your own email domain, not ours.", show: gSettings },
      { key: "t-team", route: "/dashboard/settings/profile", selector: navSel("team"), title: "Team", body: "Create roles, set permissions and invite members — we’ll set this up next.", show: gTeamView },
      { key: "t-search", route: "/dashboard/settings/profile", selector: navSel("search-activity"), title: "Search activity", body: "See how your team is using search across all campaigns.", show: gTeamManage },
      { key: "t-activity", route: "/dashboard/settings/profile", selector: navSel("activity"), title: "Activity log", body: "A full audit trail of everything that happens in your workspace.", show: gTeamManage },
      // Action steps — the highlighted button pulses so it’s obvious what to click.
      { key: "roles", route: "/dashboard/settings/team", anchor: "setup-roles", pulse: `[data-tour="new-role"]`, title: "Create a role & permissions", body: "Click the pulsing “New role” button, give it a name (e.g. “Analyst”), tick the permissions, then Save.", show: gRoles },
      { key: "members", route: "/dashboard/settings/team", anchor: "setup-members", pulse: `[data-tour="invite-member"]`, title: "Add a team member", body: "Click the pulsing “Invite” button, enter their email, pick the role you made, then send.", show: gMembers },
      { key: "integrations", route: "/dashboard/settings/integrations", anchor: "setup-integrations", pulse: `[data-tour="setup-integrations"] button`, title: "Connect Google", body: "Click the pulsing “Connect” button, then choose your Google account for Search Console & Analytics.", show: gIntegrations },
      { key: "project", route: "/dashboard", anchor: "new-project", pulse: `[data-tour="new-project"]`, title: "Create your first project", body: "Click the pulsing “New project” button, add your website and create it to start tracking.", show: gProject },
    ];
    return all.filter((s) => s.show).map(({ show, ...s }) => s);
  }, [cClients, gRoles, gMembers, gIntegrations, gProject, gBilling, gSettings, gTeamView, gTeamManage]);

  // Latest values for the single, long-lived driver instance to read.
  const stepsRef = useRef(steps); stepsRef.current = steps;
  const pathnameRef = useRef(pathname); pathnameRef.current = pathname;
  const routerRef = useRef(router); routerRef.current = router;
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;

  useEffect(() => {
    if (stepsRef.current.length === 0) { onCloseRef.current(); return; }
    // Prefetch all routes so step-to-step navigation is instant (dev compiles them ahead).
    for (const r of new Set(stepsRef.current.map((s) => s.route))) { try { routerRef.current.prefetch(r); } catch { /* ignore */ } }

    let destroyed = false;
    let idx = 0;
    let phase: "running" | "done" = "running";
    let poll: { cancel: () => void } | null = null;

    const d = driver({
      animate: true,
      smoothScroll: true,
      allowClose: false,
      overlayColor: "#0a0a0f",
      overlayOpacity: 0.6,
      stagePadding: 8,
      stageRadius: 12,
      popoverClass: "qt",
      onNextClick: () => { if (phase === "done") end(); else show(idx + 1); },
      onPrevClick: () => { if (phase === "running") show(idx - 1); },
      onCloseClick: () => end(),
    });

    // Pulse the exact button to click (a glowing ring) — cleared on step change.
    let pulsedEl: HTMLElement | null = null;
    function clearPulse() { if (pulsedEl) { pulsedEl.classList.remove("qt-pulse"); pulsedEl = null; } }
    function applyPulse(selector: string) { const el = document.querySelector(selector) as HTMLElement | null; if (el) { el.classList.add("qt-pulse"); pulsedEl = el; } }

    function end() { destroyed = true; poll?.cancel(); clearPulse(); try { d.destroy(); } catch { /* ignore */ } onCloseRef.current(); }

    const waitForEl = (selector: string, timeout = 6000) => new Promise<HTMLElement | null>((res) => {
      const start = Date.now();
      const tick = () => {
        if (destroyed) return res(null);
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) return res(el);
        if (Date.now() - start > timeout) return res(null);
        window.setTimeout(tick, 50);
      };
      tick();
    });
    const waitForPath = (route: string, timeout = 6000) => new Promise<void>((res) => {
      const start = Date.now();
      const tick = () => {
        if (destroyed) return res();
        if (pathnameRef.current === route) return res();
        if (Date.now() - start > timeout) return res();
        window.setTimeout(tick, 50);
      };
      tick();
    });

    function popover(step: Step, i: number, cfg: StepCheck | null, done: boolean) {
      const list = stepsRef.current;
      const last = i === list.length - 1;
      const status = cfg
        ? `<div class="qt-status ${done ? "qt-done" : "qt-wait"}">${done ? `✓ ${cfg.done}` : `<span class="qt-spin"></span> ${cfg.wait}`}</div>`
        : "";
      return {
        title: step.title,
        description: `<span class="qt-badge">Step ${i + 1} of ${list.length}</span><div>${step.body}</div>${status}`,
        showButtons: (i > 0 ? ["previous", "next", "close"] : ["next", "close"]) as ("previous" | "next" | "close")[],
        nextBtnText: cfg && !done ? "Skip step →" : (last ? "Finish →" : "Next →"),
        prevBtnText: "← Back",
      };
    }

    function render(step: Step, i: number, el: HTMLElement | null, cfg: StepCheck | null, done: boolean) {
      d.highlight({ element: el ?? undefined, popover: popover(step, i, cfg, done) });
    }

    async function show(target: number) {
      const list = stepsRef.current;
      if (target >= list.length) return done();
      if (target < 0) target = 0;
      idx = target;
      phase = "running";
      poll?.cancel(); poll = null;
      clearPulse();
      const step = list[idx];
      if (step.route && pathnameRef.current !== step.route) {
        routerRef.current.push(step.route);
        await waitForPath(step.route);
      }
      if (destroyed || idx !== target) return;
      const sel = targetSelector(step);
      const el = sel ? await waitForEl(sel) : null;
      if (destroyed || idx !== target) return;
      const cfg = CHECKS[step.key] ?? null;
      render(step, idx, el, cfg, !cfg);
      if (step.pulse) applyPulse(step.pulse);
      if (cfg) startPoll(step, target, cfg);
    }

    function startPoll(step: Step, target: number, cfg: StepCheck) {
      let cancelled = false;
      let baseline: number | null = null;
      const loop = async () => {
        if (cancelled || destroyed || idx !== target) return;
        try {
          const v = await cfg.get();
          let ok = false;
          if (cfg.mode === "truthy") ok = v >= 1;
          else { if (baseline == null) baseline = v; else if (v > baseline) ok = true; }
          if (ok) {
            const sel = targetSelector(step);
            const el = sel ? (document.querySelector(sel) as HTMLElement | null) : null;
            render(step, target, el, cfg, true);   // green "done" state
            window.setTimeout(() => { if (!cancelled && !destroyed && idx === target) show(target + 1); }, 1300);
            return;
          }
        } catch { /* keep polling */ }
        window.setTimeout(loop, 2000);
      };
      loop();
      poll = { cancel: () => { cancelled = true; } };
    }

    function done() {
      phase = "done";
      d.highlight({
        popover: {
          title: "You’re all set 🎉",
          description: `<span class="qt-badge">Done</span><div>That’s the tour! You can revisit any of these from Settings whenever you like. Happy optimising.</div>`,
          showButtons: ["next"] as ("next")[],
          nextBtnText: "Finish",
        },
      });
    }

    show(0);
    return () => { destroyed = true; poll?.cancel(); clearPulse(); try { d.destroy(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <style>{TOUR_CSS}</style>;
}
