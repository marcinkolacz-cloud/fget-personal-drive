import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { Check, Clock, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function AccessDenied() {
  const { identity } = useInternetIdentity();
  const [copied, setCopied] = useState(false);

  const principalId = identity?.getPrincipal().toString() || "";

  const getShortenedPrincipal = (principal: string) => {
    if (principal.length <= 11) return principal;
    return `${principal.slice(0, 4)}...${principal.slice(-4)}`;
  };

  const handleCopyPrincipal = async () => {
    try {
      await navigator.clipboard.writeText(principalId);
      setCopied(true);
      toast.success("Principal ID copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      toast.error("Failed to copy Principal ID");
    }
  };

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Clock className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-center text-2xl">
            Pending approval...
          </CardTitle>
          <CardDescription className="text-center">
            Your account is awaiting administrator approval
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Your Principal ID:
              </span>
              <Button
                onClick={handleCopyPrincipal}
                size="sm"
                variant="ghost"
                className="gap-1.5 h-7"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span className="text-xs">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="text-xs">Copy</span>
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm font-mono text-center break-all bg-background rounded px-3 py-2">
              {getShortenedPrincipal(principalId)}
            </p>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="space-y-2 text-center">
              <p className="text-sm text-muted-foreground">
                Please contact an administrator and provide them with your
                Principal ID above to request access to this application.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
