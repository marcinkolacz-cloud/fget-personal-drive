import { Heart } from "lucide-react";
import { APP_VERSION } from "../lib/appVersion";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const appIdentifier = encodeURIComponent(
    typeof window !== "undefined" ? window.location.hostname : "unknown-app",
  );

  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>© {currentYear} fget</span>
            <span className="text-muted-foreground/50">•</span>
            <span className="text-xs">v{APP_VERSION}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span>Built with</span>
            <Heart className="h-3.5 w-3.5 fill-pink-500 text-pink-500" />
            <span>using</span>
            <a
              href={`https://caffeine.ai/?utm_source=Caffeine-footer&utm_medium=referral&utm_content=${appIdentifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:text-foreground transition-colors"
            >
              caffeine.ai
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
