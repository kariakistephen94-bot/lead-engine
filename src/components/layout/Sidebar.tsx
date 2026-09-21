"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarClock,
  Handshake,
  Import,
  KanbanSquare,
  Hammer,
  Layers,
  LayoutDashboard,
  MessageCircle,
  Radar,
  Rss,
  Send,
  Settings,
  Sparkles,
  PenLine,
  Table2,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV: { section: string; items: { href: string; label: string; icon: React.ElementType }[] }[] =
  [
    {
      section: "Operate",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/today", label: "Today's Prospecting", icon: Target },
        { href: "/follow-ups", label: "Follow-ups", icon: CalendarClock },
      ],
    },
    {
      section: "Database",
      items: [
        { href: "/leads", label: "Leads", icon: Table2 },
        { href: "/companies", label: "Companies", icon: Building2 },
        { href: "/niches", label: "Niches", icon: Layers },
      ],
    },
    {
      section: "Pipeline",
      items: [
        { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
        { href: "/deals", label: "Deals", icon: Handshake },
      ],
    },
    {
      section: "Build in public",
      items: [
        { href: "/build", label: "Build Tracker", icon: Hammer },
        { href: "/content", label: "Content Engine", icon: PenLine },
      ],
    },
    {
      section: "Grow",
      items: [
        { href: "/engine", label: "Lead Engine", icon: Radar },
        { href: "/outreach", label: "Outreach", icon: Send },
        { href: "/social", label: "Social DMs", icon: MessageCircle },
        { href: "/jobs", label: "Opportunities", icon: Rss },
        { href: "/prospect", label: "Find Leads", icon: Sparkles },
        { href: "/import", label: "Import", icon: Import },
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
      ],
    },
  ];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-13 items-center gap-2 border-b border-line px-4">
        <div className="flex h-6.5 w-6.5 items-center justify-center rounded bg-brand text-[10px] font-bold text-white">
          LE
        </div>
        <span className="text-sm font-semibold text-ink">Lead Engine</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((group) => (
          <div key={group.section} className="mb-4">
            <p className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-brand-soft font-medium text-brand-ink"
                          : "text-ink-soft hover:bg-muted hover:text-ink",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand" : "text-ink-faint")} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-2">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-brand-soft font-medium text-brand-ink"
              : "text-ink-soft hover:bg-muted hover:text-ink",
          )}
        >
          <Settings className="h-4 w-4 text-ink-faint" />
          Settings
        </Link>
      </div>
    </nav>
  );
}
