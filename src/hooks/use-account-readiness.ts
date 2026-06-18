import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReadinessItem = {
  key: "email" | "sender" | "wallet";
  label: string;
  done: boolean;
  hint?: string;
  cta?: { to: string; label: string };
};

export type AccountReadiness = {
  ready: boolean;
  items: ReadinessItem[];
  wallet: number;
  refetch: () => void;
  isLoading: boolean;
};

export function useAccountReadiness(): AccountReadiness {
  const q = useQuery({
    queryKey: ["account-readiness"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const emailVerified = !!userRes.user?.email_confirmed_at;

      const [{ data: senders }, { data: numbers }, { data: wallet }] = await Promise.all([
        supabase.from("sender_ids").select("id").eq("status", "approved").limit(1),
        supabase.from("phone_numbers").select("id").eq("status", "active").limit(1),
        supabase.from("wallets").select("balance_credits").maybeSingle(),
      ]);

      const hasSender = (senders?.length ?? 0) > 0 || (numbers?.length ?? 0) > 0;
      const balance = Number(wallet?.balance_credits ?? 0);
      return { emailVerified, hasSender, balance };
    },
  });

  const d = q.data;
  const items: ReadinessItem[] = [
    {
      key: "email",
      label: "Verify your email",
      done: !!d?.emailVerified,
      hint: "Confirm the email address you signed up with.",
      cta: { to: "/verify-email", label: "Verify email" },
    },
    {
      key: "sender",
      label: "Approved sender identity",
      done: !!d?.hasSender,
      hint: "Add a verified phone number or get a Sender ID approved.",
      cta: { to: "/app/numbers", label: "Manage senders" },
    },
    {
      key: "wallet",
      label: "Fund your wallet",
      done: (d?.balance ?? 0) > 0,
      hint: "You need credits to send SMS.",
      cta: { to: "/app/billing", label: "Add credits" },
    },
  ];

  return {
    ready: items.every((i) => i.done),
    items,
    wallet: d?.balance ?? 0,
    refetch: q.refetch,
    isLoading: q.isLoading,
  };
}
