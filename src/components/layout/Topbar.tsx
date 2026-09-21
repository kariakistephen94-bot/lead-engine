"use client";

import { useRouter } from "next/navigation";
import { LogOut, Plus, User as UserIcon } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dropdown, MenuDivider, MenuItem, MenuLabel } from "@/components/ui/Dropdown";
import { QuickAddLead } from "@/components/leads/QuickAddLead";
import { initials } from "@/lib/utils";
import { GlobalSearch } from "./GlobalSearch";

export function Topbar({
  user,
  menuButton,
}: {
  user: { name: string; email: string };
  menuButton?: React.ReactNode;
}) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
      {menuButton}
      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        <QuickAddLead
          trigger={(open) => (
            <Button variant="primary" size="sm" onClick={open}>
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Quick add</span>
            </Button>
          )}
        />

        <Dropdown
          trigger={({ toggle }) => (
            <button
              onClick={toggle}
              className="flex h-7.5 w-7.5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-ink-soft transition-colors hover:bg-line"
              aria-label="Account menu"
            >
              {initials(user.name)}
            </button>
          )}
        >
          {({ close }) => (
            <>
              <MenuLabel>Signed in as</MenuLabel>
              <p className="truncate px-3 pb-2 text-xs text-ink">{user.email}</p>
              <MenuDivider />
              <MenuItem
                icon={<UserIcon className="h-3.5 w-3.5" />}
                onClick={() => {
                  close();
                  router.push("/settings");
                }}
              >
                Settings
              </MenuItem>
              <MenuItem icon={<LogOut className="h-3.5 w-3.5" />} onClick={signOut} destructive>
                Sign out
              </MenuItem>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
