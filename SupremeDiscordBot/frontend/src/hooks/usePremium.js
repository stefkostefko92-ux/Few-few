// frontend/src/hooks/usePremium.js
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getServer, getPremiumCatalog } from "../api";

/**
 * Centralized hook for premium state.
 * Returns:
 *   isPremium    — boolean
 *   features     — { [featureKey]: { label, category } }
 *   limits       — { panels, forms, ... } for the server's tier
 *   isLoading    — boolean
 *
 * Use in any page to drive PremiumBadge / PremiumGate rendering.
 */
export function usePremium() {
  const { serverId } = useParams();

  const { data: server, isLoading: serverLoading } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId),
    enabled: !!serverId,
  });

  const { data: catalog } = useQuery({
    queryKey: ["premium-catalog"],
    queryFn: getPremiumCatalog,
    staleTime: 1000 * 60 * 60, // 1h
  });

  const isPremium = !!server?.isPremium;
  const isTrial = !!server?.isTrial;
  const trialDaysLeft = server?.trialDaysLeft || 0;

  return {
    isPremium,
    isTrial,
    trialDaysLeft,
    features: catalog?.features || {},
    limits: isPremium ? catalog?.premiumLimits : catalog?.baseLimits,
    baseLimits: catalog?.baseLimits,
    premiumLimits: catalog?.premiumLimits,
    isLoading: serverLoading || !catalog,
  };
}
