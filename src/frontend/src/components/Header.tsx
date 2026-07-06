import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Loader2,
  LogIn,
  LogOut,
  Settings,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserRole } from "../backend";
import {
  useGetAdmin,
  useGetCallerUserProfile,
  useGetCallerUserRole,
  useSetAdmin,
} from "../hooks/useQueries";
import { ManagePanel } from "./ManagePanel";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const { login, clear, loginStatus, identity } = useInternetIdentity();
  const queryClient = useQueryClient();
  const { data: userProfile } = useGetCallerUserProfile();
  const { data: userRole } = useGetCallerUserRole();
  const { data: adminPrincipal, isLoading: adminLoading } = useGetAdmin();
  const setAdmin = useSetAdmin();
  const [copiedPrincipal, setCopiedPrincipal] = useState(false);

  const isAuthenticated = !!identity;
  const isLoggingIn = loginStatus === "logging-in";
  const callerPrincipalText = identity?.getPrincipal().toText();
  const adminPrincipalText = adminPrincipal?.toText?.();
  const isAdminByPrincipal =
    !!callerPrincipalText &&
    !!adminPrincipalText &&
    callerPrincipalText === adminPrincipalText;
  const isAdmin = userRole === UserRole.admin || isAdminByPrincipal;
  const noAdminSet =
    !adminLoading && (adminPrincipal === null || adminPrincipal === undefined);

  const handleAuth = async () => {
    if (isAuthenticated) {
      await clear();
      queryClient.clear();
    } else {
      try {
        await login();
      } catch (error: any) {
        console.error("Login error:", error);
        if (error.message === "User is already authenticated") {
          await clear();
          setTimeout(() => login(), 300);
        }
      }
    }
  };

  const getShortenedPrincipal = () => {
    if (!identity) return "";
    const principal = identity.getPrincipal().toString();
    if (principal.length <= 11) return principal;
    return `${principal.slice(0, 4)}...${principal.slice(-4)}`;
  };

  const handleCopyPrincipal = async () => {
    if (!identity) return;
    const principal = identity.getPrincipal().toString();
    try {
      await navigator.clipboard.writeText(principal);
      setCopiedPrincipal(true);
      toast.success("Principal ID copied to clipboard");
      setTimeout(() => setCopiedPrincipal(false), 2000);
    } catch (_error) {
      toast.error("Failed to copy Principal ID");
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Upload className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">fget</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated && (
            <>
              {userProfile && (
                <div className="hidden md:flex items-center gap-2">
                  <Badge variant="secondary" className="text-sm font-medium">
                    {userProfile.name}
                  </Badge>
                  <Button
                    onClick={handleCopyPrincipal}
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground"
                  >
                    {getShortenedPrincipal()}
                    {copiedPrincipal ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
              {isAdmin && <ManagePanel />}
              {noAdminSet && (
                <Button
                  data-ocid="header.set_admin_button"
                  onClick={() => {
                    if (!identity) return;
                    setAdmin.mutate(identity.getPrincipal(), {
                      onSuccess: () => {
                        toast.success("Jesteś teraz administratorem!");
                        setTimeout(() => window.location.reload(), 600);
                      },
                      onError: () =>
                        toast.error("Nie udało się ustawić admina."),
                    });
                  }}
                  disabled={setAdmin.isPending}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                >
                  {setAdmin.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Settings className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    Ustaw mnie jako admina
                  </span>
                </Button>
              )}
            </>
          )}
          <ThemeToggle />
          <Button
            onClick={handleAuth}
            disabled={isLoggingIn}
            variant={isAuthenticated ? "outline" : "default"}
            size="sm"
            className="gap-2"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Logowanie...
              </>
            ) : isAuthenticated ? (
              <>
                <LogOut className="h-4 w-4" />
                Wyloguj
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Zaloguj
              </>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
