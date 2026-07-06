// Utility to get canister IDs from environment variables or dfx-generated files
export function getCanisterIds(): { backend: string; frontend: string } {
  // Try multiple sources for canister IDs in order of preference:

  // 1. Try Vite environment variables (prefixed with VITE_)
  let backendId =
    import.meta.env.VITE_CANISTER_ID_BACKEND ||
    import.meta.env.VITE_BACKEND_CANISTER_ID;

  let frontendId =
    import.meta.env.VITE_CANISTER_ID_FRONTEND ||
    import.meta.env.VITE_FRONTEND_CANISTER_ID;

  // 2. Try standard CANISTER_ID_ prefix (used by dfx)
  if (!backendId) {
    backendId =
      import.meta.env.CANISTER_ID_BACKEND ||
      import.meta.env.CANISTER_ID_backend;
  }

  if (!frontendId) {
    frontendId =
      import.meta.env.CANISTER_ID_FRONTEND ||
      import.meta.env.CANISTER_ID_frontend;
  }

  // 3. Try to get from window object (sometimes set by dfx in development)
  if (typeof window !== "undefined") {
    if (!backendId) {
      backendId =
        (window as any).CANISTER_ID_BACKEND ||
        (window as any).BACKEND_CANISTER_ID;
    }

    if (!frontendId) {
      frontendId =
        (window as any).CANISTER_ID_FRONTEND ||
        (window as any).FRONTEND_CANISTER_ID;
    }
  }

  // 4. Try to extract from current URL (for frontend canister)
  if (!frontendId && typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const canisterIdFromUrl = urlParams.get("canisterId");
    if (canisterIdFromUrl) {
      frontendId = canisterIdFromUrl;
    }

    // Also try to extract from hostname (format: <canister-id>.ic0.app or <canister-id>.localhost)
    const hostname = window.location.hostname;
    const icAppMatch = hostname.match(
      /^([a-z0-9-]+)\.(?:ic0\.app|localhost|raw\.ic0\.app)$/,
    );
    if (icAppMatch?.[1]) {
      frontendId = icAppMatch[1];
    }
  }

  // 5. Try to get backend canister ID from the actor configuration
  // This is set during the build process by dfx
  if (!backendId) {
    try {
      // Try to import from generated declarations
      const canisterIds = (import.meta as any).env?.CANISTER_IDS;
      if (canisterIds?.backend) {
        backendId = canisterIds.backend;
      }
    } catch {
      // Ignore errors
    }
  }

  // 6. Try to get from process.env (for compatibility with older setups)
  if (typeof process !== "undefined" && (process as any).env) {
    if (!backendId) {
      backendId =
        (process as any).env.CANISTER_ID_BACKEND ||
        (process as any).env.BACKEND_CANISTER_ID;
    }
    if (!frontendId) {
      frontendId =
        (process as any).env.CANISTER_ID_FRONTEND ||
        (process as any).env.FRONTEND_CANISTER_ID;
    }
  }

  return {
    backend: backendId || "unknown",
    frontend: frontendId || "unknown",
  };
}

// Get the backend canister ID specifically
export function getBackendCanisterId(): string {
  return getCanisterIds().backend;
}

// Get the frontend canister ID specifically
export function getFrontendCanisterId(): string {
  return getCanisterIds().frontend;
}
