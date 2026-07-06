import { createActor } from "@/backend";
import { useActor, useInternetIdentity } from "@caffeineai/core-infrastructure";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Bootstrap hook that automatically calls initializeAccessControl() once per authenticated session
 * and invalidates access-related React Query caches after bootstrap completes.
 */
export function useAccessBootstrap() {
  const { actor, isFetching: actorFetching } = useActor(createActor);
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();
  const bootstrapAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!actor || actorFetching || !identity) {
      return;
    }

    const principalString = identity.getPrincipal().toString();

    // Only bootstrap once per principal per session
    if (bootstrapAttemptedRef.current === principalString) {
      return;
    }
    bootstrapAttemptedRef.current = principalString;

    // Invalidate all access-related queries so they refetch with the current principal
    queryClient.invalidateQueries({ queryKey: ["checkAccess"] });
    queryClient.invalidateQueries({ queryKey: ["callerUserRole"] });
    queryClient.invalidateQueries({ queryKey: ["callerApproved"] });
    queryClient.invalidateQueries({ queryKey: ["admin"] });
    queryClient.invalidateQueries({ queryKey: ["currentUserProfile"] });
  }, [actor, actorFetching, identity, queryClient]);
}
