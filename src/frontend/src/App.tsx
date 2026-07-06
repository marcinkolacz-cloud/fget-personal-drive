import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { useQueryClient } from "@tanstack/react-query";
import { Key, Loader2, LogIn } from "lucide-react";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AccessCheckResult } from "./backend";
import { AccessDenied } from "./components/AccessDenied";
import { FileList } from "./components/FileList";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { ProfileSetup } from "./components/ProfileSetup";
import { useAccessBootstrap } from "./hooks/useAccessBootstrap";
import {
  useCheckAccess,
  useGetCallerUserProfile,
  useRedeemInviteCode,
  useSetFrontendCanisterId,
} from "./hooks/useQueries";
import { getFrontendCanisterId } from "./lib/canisterIds";

export default function App() {
  const { identity, isInitializing } = useInternetIdentity();
  const queryClient = useQueryClient();

  // Bootstrap access control automatically after login
  useAccessBootstrap();

  const { data: accessResult, isLoading: accessLoading } = useCheckAccess();

  const isAdmin = accessResult === AccessCheckResult.Admin;
  const isApproved = accessResult === AccessCheckResult.Approved;
  const hasAccess = isAdmin || isApproved;

  // Only fetch profile if user has access
  const {
    data: userProfile,
    isLoading: profileLoading,
    isFetched,
  } = useGetCallerUserProfile();
  const setFrontendCanisterId = useSetFrontendCanisterId();
  const redeemInviteCode = useRedeemInviteCode();

  // Folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Invite code state
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);

  const isAuthenticated = !!identity;

  // Derive screen states from AccessCheckResult enum
  const showNeedsInvite =
    isAuthenticated &&
    !accessLoading &&
    accessResult === AccessCheckResult.NeedsInvite;

  const showPendingApproval =
    isAuthenticated &&
    !accessLoading &&
    accessResult === AccessCheckResult.PendingApproval;

  // Show profile setup only if user has access but no profile
  const showProfileSetup =
    isAuthenticated &&
    hasAccess &&
    !profileLoading &&
    isFetched &&
    userProfile === null;

  // Only show content if user is authenticated, has access, and has a profile
  const showContent =
    isAuthenticated && hasAccess && userProfile !== null && !accessLoading;

  // Set frontend canister ID when user with access is authenticated
  useEffect(() => {
    if (hasAccess && !setFrontendCanisterId.isPending) {
      const frontendId = getFrontendCanisterId();
      if (frontendId && frontendId !== "unknown") {
        setFrontendCanisterId.mutate(frontendId);
      }
    }
  }, [hasAccess, setFrontendCanisterId]);

  // Clear all queries when user loses access or is unapproved
  useEffect(() => {
    if (isAuthenticated && !accessLoading && !hasAccess) {
      queryClient.removeQueries({ queryKey: ["files"] });
      queryClient.removeQueries({ queryKey: ["folderContents"] });
      queryClient.removeQueries({ queryKey: ["folders"] });
      queryClient.removeQueries({ queryKey: ["storageStats"] });
      queryClient.removeQueries({ queryKey: ["members"] });
      queryClient.removeQueries({ queryKey: ["currentUserProfile"] });
    }
  }, [isAuthenticated, accessLoading, hasAccess, queryClient]);

  // Focus invite input when the screen appears
  useEffect(() => {
    if (showNeedsInvite) {
      setTimeout(() => inviteInputRef.current?.focus(), 100);
    }
  }, [showNeedsInvite]);

  const handleFolderNavigate = (folderId: string | null) => {
    setCurrentFolderId(folderId);
  };

  const handleRedeemCode = async () => {
    if (!inviteCode.trim()) {
      setInviteError("Podaj kod zaproszenia.");
      return;
    }
    setInviteError(null);
    const result = await redeemInviteCode
      .mutateAsync(inviteCode.trim())
      .catch((err: Error) => ({ __kind__: "err" as const, err: err.message }));
    if (result.__kind__ === "ok") {
      toast.success("Kod zaproszenia aktywowany!");
      setInviteCode("");
      queryClient.invalidateQueries({ queryKey: ["checkAccess"] });
    } else {
      setInviteError("Nieprawidłowy lub wygasły kod zaproszenia.");
    }
  };

  const handleDevBypass = () => {
    // Dev-only bypass: mark access as bypassed and refetch to get a fresh access state
    toast.info("Tryb testowy: pominięto weryfikację kodu");
    queryClient.setQueryData(["checkAccess"], AccessCheckResult.Approved);
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          {isInitializing || (isAuthenticated && accessLoading) ? (
            <div className="container mx-auto px-4 py-16 max-w-5xl">
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Ładowanie...</p>
              </div>
            </div>
          ) : !isAuthenticated ? (
            <div className="container mx-auto px-4 py-16 max-w-5xl">
              <div className="flex flex-col items-center justify-center text-center space-y-4 min-h-[60vh]">
                <h2 className="text-4xl font-bold tracking-tight sm:text-5xl bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                  Personal File Storage & Sharing
                </h2>
              </div>
            </div>
          ) : showNeedsInvite ? (
            <div
              className="container mx-auto px-4 py-16 max-w-md"
              data-ocid="invite.page"
            >
              <div className="flex flex-col items-center text-center gap-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                  <Key className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight">
                    Wymagany kod zaproszenia
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Aby uzyskać dostęp do aplikacji, podaj kod zaproszenia
                    otrzymany od administratora.
                  </p>
                </div>
                <div className="w-full space-y-3">
                  <div className="space-y-1.5 text-left">
                    <Label htmlFor="invite-code-input">Kod zaproszenia</Label>
                    <Input
                      ref={inviteInputRef}
                      id="invite-code-input"
                      data-ocid="invite.input"
                      placeholder="Wpisz kod zaproszenia…"
                      value={inviteCode}
                      onChange={(e) => {
                        setInviteCode(e.target.value);
                        setInviteError(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleRedeemCode()}
                      className={inviteError ? "border-destructive" : ""}
                      disabled={redeemInviteCode.isPending}
                    />
                    {inviteError && (
                      <p
                        className="text-sm text-destructive"
                        data-ocid="invite.error_state"
                      >
                        {inviteError}
                      </p>
                    )}
                  </div>
                  <Button
                    data-ocid="invite.submit_button"
                    className="w-full"
                    onClick={handleRedeemCode}
                    disabled={redeemInviteCode.isPending || !inviteCode.trim()}
                  >
                    {redeemInviteCode.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <LogIn className="mr-2 h-4 w-4" />
                    )}
                    Aktywuj kod
                  </Button>
                  {import.meta.env.DEV && (
                    <Button
                      data-ocid="invite.dev_bypass_button"
                      variant="outline"
                      className="w-full text-muted-foreground"
                      onClick={handleDevBypass}
                      type="button"
                    >
                      Pomiń kod (test)
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : showPendingApproval ? (
            <AccessDenied />
          ) : showProfileSetup ? (
            <ProfileSetup />
          ) : showContent ? (
            <div className="container mx-auto px-4 py-8 max-w-5xl">
              <FileList
                currentFolderId={currentFolderId}
                onFolderNavigate={handleFolderNavigate}
              />
            </div>
          ) : (
            <div className="container mx-auto px-4 py-16 max-w-5xl">
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Ładowanie...</p>
              </div>
            </div>
          )}
        </main>
        <Footer />
        <Toaster />
      </div>
    </ThemeProvider>
  );
}
