import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, Megaphone, Inbox, Users, Filter, ShieldOff, MessageSquareText, ShieldCheck,
  UserPlus, Settings, Wallet, Calculator, Plus,
} from "lucide-react";
import { getMySession } from "@/lib/session.functions";
import type { PermissionKey } from "@/lib/team-permissions";

type Cmd = {
  label: string;
  hint?: string;
  to: string;
  icon: any;
  group: "Jump to" | "Actions" | "Settings";
  perm?: PermissionKey;
  ownerOnly?: boolean;
};

const COMMANDS: Cmd[] = [
  { label: "New campaign", hint: "Compose and send SMS", to: "/app/campaigns/new", icon: Plus, group: "Actions", perm: "campaigns" },
  { label: "Import contacts", hint: "Upload a CSV", to: "/app/audience", icon: Users, group: "Actions", perm: "audience" },
  { label: "Dashboard", to: "/app", icon: LayoutDashboard, group: "Jump to", perm: "dashboard" },
  { label: "Campaigns", to: "/app/campaigns", icon: Megaphone, group: "Jump to", perm: "campaigns" },
  { label: "Inbox", to: "/app/inbox", icon: Inbox, group: "Jump to", perm: "inbox" },
  { label: "Audience", to: "/app/audience", icon: Users, group: "Jump to", perm: "audience" },
  { label: "Segments", to: "/app/segments", icon: Filter, group: "Jump to", perm: "segments" },
  { label: "Suppressions", to: "/app/suppressions", icon: ShieldOff, group: "Jump to", perm: "suppressions" },
  { label: "Set up SMS", to: "/app/setup-sms", icon: MessageSquareText, group: "Jump to", perm: "setup_sms" },
  { label: "10DLC (US local)", to: "/app/setup-10dlc", icon: MessageSquareText, group: "Jump to", perm: "setup_sms" },
  { label: "Toll-free verification", to: "/app/toll-free-verification", icon: ShieldCheck, group: "Jump to", perm: "setup_sms" },
  { label: "Team", to: "/app/team", icon: UserPlus, group: "Jump to", perm: "team" },
  { label: "Account settings", to: "/app/settings", icon: Settings, group: "Settings", perm: "settings" },
  { label: "Billing", to: "/app/billing", icon: Wallet, group: "Settings", perm: "billing" },
  { label: "SMS pricing", to: "/app/pricing-calculator", icon: Calculator, group: "Settings", ownerOnly: true },
];

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { data: session } = useQuery({ queryKey: ["my-session"], queryFn: () => getMySession(), staleTime: 60_000 });

  const allowed = COMMANDS.filter((c) => {
    if (!session) return false;
    if (session.isOwner) return true;
    if (c.ownerOnly) return false;
    if (!c.perm) return true;
    return !!session.permissions[c.perm];
  });

  const groups: Cmd["group"][] = ["Actions", "Jump to", "Settings"];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((g, i) => {
          const items = allowed.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              {i > 0 && <CommandSeparator />}
              <CommandGroup heading={g}>
                {items.map((c) => (
                  <CommandItem
                    key={`${g}-${c.to}-${c.label}`}
                    value={`${c.label} ${c.hint ?? ""}`}
                    onSelect={() => {
                      onOpenChange(false);
                      navigate({ to: c.to });
                    }}
                  >
                    <c.icon className="size-4" />
                    <span>{c.label}</span>
                    {c.hint && <span className="ml-auto text-xs text-muted-foreground">{c.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
