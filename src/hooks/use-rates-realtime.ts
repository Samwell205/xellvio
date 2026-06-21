import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to country_rates changes and invalidate the given query keys
 * so any SMS Pricing UI re-renders immediately when an admin updates rates.
 */
export function useRatesRealtime(queryKeys: Array<readonly unknown[]>) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("country-rates-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "country_rates" },
        () => {
          queryKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
