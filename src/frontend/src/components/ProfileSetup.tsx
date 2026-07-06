import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, Loader2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useIsUsernameUnique,
  useSaveCallerUserProfile,
} from "../hooks/useQueries";

export function ProfileSetup() {
  const [username, setUsername] = useState("");
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [isUnique, setIsUnique] = useState<boolean | null>(null);
  const [checkingUnique, setCheckingUnique] = useState(false);
  const saveProfile = useSaveCallerUserProfile();
  const checkUsername = useIsUsernameUnique();

  // Debounce username input and check uniqueness
  useEffect(() => {
    const timer = setTimeout(async () => {
      const trimmed = username.trim();
      setDebouncedUsername(trimmed);

      if (trimmed.length >= 2) {
        setCheckingUnique(true);
        try {
          const result = await checkUsername.mutateAsync(trimmed);
          setIsUnique(result);
        } catch (_error) {
          setIsUnique(null);
        } finally {
          setCheckingUnique(false);
        }
      } else {
        setIsUnique(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, checkUsername]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      toast.error("Please enter a username");
      return;
    }

    if (trimmedUsername.length < 2) {
      toast.error("Username must be at least 2 characters");
      return;
    }

    if (!isUnique) {
      toast.error("This username is already taken");
      return;
    }

    try {
      await saveProfile.mutateAsync({ name: trimmedUsername });
      toast.success("Profile created successfully");
    } catch (error: any) {
      // Handle backend validation errors
      const errorMessage = error?.message || "Failed to create profile";
      if (
        errorMessage.includes("Username already taken") ||
        errorMessage.includes("already taken")
      ) {
        toast.error("Username Already Taken", {
          description:
            "This username was just taken by another user. Please choose a different one.",
        });
        // Re-check uniqueness
        setIsUnique(null);
        setCheckingUnique(true);
        try {
          const result = await checkUsername.mutateAsync(trimmedUsername);
          setIsUnique(result);
        } catch {
          setIsUnique(null);
        } finally {
          setCheckingUnique(false);
        }
      } else if (errorMessage.includes("Username cannot be empty")) {
        toast.error("Invalid Username", {
          description: "Username cannot be empty or contain only spaces.",
        });
      } else {
        toast.error("Failed to Create Profile", {
          description: errorMessage,
        });
      }
    }
  };

  const showValidation = debouncedUsername.length >= 2;
  const isValid = showValidation && isUnique === true;
  const isInvalid = showValidation && isUnique === false;

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <User className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-center">Welcome to fget</CardTitle>
          <CardDescription className="text-center">
            Please choose a unique username to complete your profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={saveProfile.isPending}
                  autoFocus
                  className={
                    isValid
                      ? "border-green-500 focus-visible:ring-green-500"
                      : isInvalid
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                  }
                />
                {checkingUnique && debouncedUsername && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {isValid && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                )}
                {isInvalid && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  </div>
                )}
              </div>
              {isInvalid && (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This username is already taken. Please choose another one.
                  </AlertDescription>
                </Alert>
              )}
              {isValid && (
                <Alert className="mt-2 border-green-500 text-green-700 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    This username is available!
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={
                saveProfile.isPending ||
                !username.trim() ||
                username.trim().length < 2 ||
                !isUnique
              }
            >
              {saveProfile.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating profile...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
