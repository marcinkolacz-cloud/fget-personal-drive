import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  loadConfig,
  useInternetIdentity,
} from "@caffeineai/core-infrastructure";
import { Principal } from "@icp-sdk/core/principal";
import { useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Info,
  Key,
  Loader2,
  Plus,
  Server,
  Settings,
  Shield,
  Ticket,
  Trash2,
  User,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserRole } from "../backend";
import {
  type ApiKey,
  type InviteCode,
  useAddMember,
  useDeleteApiKey,
  useGenerateApiKey,
  useGenerateInviteCode,
  useGetMembers,
  useGetStorageStats,
  useListApiKeys,
  useListInviteCodes,
  useRemoveMember,
  useRevokeInviteCode,
} from "../hooks/useQueries";
import { APP_VERSION } from "../lib/appVersion";

export function ManagePanel() {
  const [open, setOpen] = useState(false);
  const [principalId, setPrincipalId] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.user);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<{
    principal: Principal;
    username: string;
  } | null>(null);
  const [apiKeyToDelete, setApiKeyToDelete] = useState<ApiKey | null>(null);
  const [newKeyDescription, setNewKeyDescription] = useState("");
  const [infoKey, setInfoKey] = useState<ApiKey | null>(null);
  const [backendCanisterId, setBackendCanisterId] =
    useState<string>("loading...");

  // Invite codes state
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeToRevoke, setCodeToRevoke] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);

  useEffect(() => {
    loadConfig()
      .then((cfg) => {
        setBackendCanisterId(
          cfg.backend_canister_id || "YOUR_BACKEND_CANISTER_ID",
        );
      })
      .catch(() => {
        setBackendCanisterId("YOUR_BACKEND_CANISTER_ID");
      });
  }, []);

  const {
    data: members,
    isLoading: membersLoading,
    refetch: refetchMembers,
  } = useGetMembers();
  const { data: storageStats, isLoading: statsLoading } = useGetStorageStats();
  const { data: apiKeys, isLoading: apiKeysLoading } = useListApiKeys();
  const addMember = useAddMember();
  const removeMember = useRemoveMember();
  const generateApiKey = useGenerateApiKey();
  const deleteApiKey = useDeleteApiKey();
  const { identity, clear } = useInternetIdentity();
  const queryClient = useQueryClient();

  const generateInviteCode = useGenerateInviteCode();
  const { data: inviteCodes, isLoading: inviteCodesLoading } =
    useListInviteCodes();
  const revokeInviteCode = useRevokeInviteCode();

  // First admin is the first member in the list (backend ensures this)
  const firstAdminPrincipal =
    members && members.length > 0 ? members[0].principal.toString() : null;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedId = principalId.trim();

    if (!trimmedId) {
      toast.error("Please enter a Principal ID");
      return;
    }

    try {
      const principal = Principal.fromText(trimmedId);
      await addMember.mutateAsync({ principal, role: selectedRole });

      // Force immediate refetch to ensure UI updates
      await refetchMembers();

      toast.success("Member added successfully");
      setPrincipalId("");
      setSelectedRole(UserRole.user);
    } catch (error) {
      toast.error("Failed to add member", {
        description:
          error instanceof Error ? error.message : "Invalid Principal ID",
      });
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;

    const deletedPrincipalStr = memberToDelete.principal.toString();
    const currentUserPrincipal = identity?.getPrincipal().toString();

    try {
      await removeMember.mutateAsync(memberToDelete.principal);

      // Force immediate refetch to ensure UI updates
      await refetchMembers();

      toast.success("Member removed successfully", {
        description: `${memberToDelete.username} has been removed`,
      });
      setMemberToDelete(null);

      // If the deleted member is the current user, log them out
      if (currentUserPrincipal === deletedPrincipalStr) {
        // Clear all cached data
        queryClient.clear();
        // Log out the user
        await clear();
        toast.info("You have been removed from the system", {
          description: "Please log in again to set up a new profile",
        });
      }
    } catch (error) {
      toast.error("Failed to remove member", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleDeleteApiKey = async () => {
    if (!apiKeyToDelete) return;
    try {
      await deleteApiKey.mutateAsync(apiKeyToDelete.id);
      toast.success("API key deleted successfully");
      setApiKeyToDelete(null);
    } catch (error) {
      toast.error("Failed to delete API key", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleGenerateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newKeyDescription.trim();
    if (!trimmed) {
      toast.error("Please enter a description");
      return;
    }
    try {
      await generateApiKey.mutateAsync(trimmed);
      toast.success("API key generated successfully");
      setNewKeyDescription("");
    } catch (error) {
      toast.error("Failed to generate API key", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleGenerateInviteCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const expiresAtBigint: bigint | null = inviteExpiresAt
        ? BigInt(new Date(inviteExpiresAt).getTime() * 1_000_000)
        : null;
      const maxUsesBigint: bigint | null = inviteMaxUses
        ? BigInt(Number.parseInt(inviteMaxUses, 10))
        : null;
      const code = await generateInviteCode.mutateAsync({
        expiresAt: expiresAtBigint,
        maxUses: maxUsesBigint,
      });
      setGeneratedCode(code);
      setInviteExpiresAt("");
      setInviteMaxUses("");
      setShowInviteForm(false);
      toast.success("Kod zaproszenia wygenerowany");
    } catch (error) {
      toast.error("Błąd generowania kodu", {
        description: error instanceof Error ? error.message : "Nieznany błąd",
      });
    }
  };

  const handleRevokeInviteCode = async () => {
    if (!codeToRevoke) return;
    try {
      await revokeInviteCode.mutateAsync(codeToRevoke);
      toast.success("Kod zaproszenia unieważniony");
      setCodeToRevoke(null);
    } catch (error) {
      toast.error("Błąd unieważniania kodu", {
        description: error instanceof Error ? error.message : "Nieznany błąd",
      });
    }
  };

  const formatInviteDate = (nanoTimestamp: bigint): string => {
    const ms = Number(nanoTimestamp) / 1_000_000;
    return new Date(ms).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getShortenedPrincipal = (principal: string) => {
    if (principal.length <= 11) return principal;
    return `${principal.slice(0, 4)}...${principal.slice(-4)}`;
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (_error) {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const formatStorageSize = (bytes: bigint): string => {
    const numBytes = Number(bytes);
    if (numBytes === 0) return "0 B";

    const kb = numBytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;

    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(2)} MB`;

    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const getRoleBadge = (role: UserRole) => {
    if (role === UserRole.admin) {
      return (
        <Badge variant="default" className="gap-1">
          <Shield className="h-3 w-3" />
          Admin
        </Badge>
      );
    }
    if (role === UserRole.user) {
      return (
        <Badge variant="secondary" className="gap-1">
          <User className="h-3 w-3" />
          User
        </Badge>
      );
    }
    return null;
  };

  const getMaskedToken = (token: string) => {
    if (token.length <= 8) return token;
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  };

  const getInfoSnippets = (key: ApiKey) => {
    const backendId = backendCanisterId;
    const uploadUrl = `https://${backendId}.icp0.io/upload`;
    const snippet1 = `curl -X POST ${uploadUrl} \\
  -H "X-API-Token: ${key.token}" \\
  -H "X-Filename: myfile.txt" \\
  --data-binary @myfile.txt`;
    const snippet2 = `curl -X POST ${uploadUrl} \\
  -H "X-API-Token: ${key.token}" \\
  -H "X-Filename: myfile.txt" \\
  -H "X-Folder: myfolder" \\
  --data-binary @myfile.txt`;
    return { snippet1, snippet2 };
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Manage</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Settings className="h-6 w-6 text-primary" />
              Manage
            </DialogTitle>
            <DialogDescription>
              View storage statistics and manage members
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Storage Statistics */}
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-5 w-5 text-blue-500" />
                  Storage Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {statsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : storageStats ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm text-muted-foreground">
                        Used:
                      </span>
                      <span className="text-sm font-semibold text-blue-500">
                        {formatStorageSize(storageStats.totalStorageBytes)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm text-muted-foreground">
                        Folders:
                      </span>
                      <span className="text-sm font-semibold text-yellow-500">
                        {Number(storageStats.totalFolders)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm text-muted-foreground">
                        Files/Encrypted:
                      </span>
                      <span className="text-sm font-semibold">
                        <span className="text-blue-500">
                          {Number(storageStats.totalFiles)}
                        </span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-red-500">
                          {Number(storageStats.totalEncryptedFiles)}
                        </span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Unable to load statistics
                  </p>
                )}
              </CardContent>
            </Card>

            <Separator />

            {/* Current Members */}
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5 text-primary" />
                  Current Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                {membersLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : members && members.length > 0 ? (
                  <div className="space-y-2">
                    {members.map((member) => {
                      const principalStr = member.principal.toString();
                      const isCopied = copiedId === principalStr;
                      const isFirstAdmin = principalStr === firstAdminPrincipal;

                      return (
                        <div
                          key={principalStr}
                          className="flex items-center justify-between p-3 rounded-lg bg-background/60"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                              {member.role === UserRole.admin ? (
                                <Shield className="h-4 w-4 text-primary" />
                              ) : (
                                <User className="h-4 w-4 text-primary" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">
                                  {member.username}
                                </p>
                                {getRoleBadge(member.role)}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {getShortenedPrincipal(principalStr)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              onClick={() =>
                                handleCopyText(principalStr, "Principal ID")
                              }
                              size="sm"
                              variant="ghost"
                              className="gap-1.5"
                            >
                              {isCopied ? (
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
                            {!isFirstAdmin && (
                              <Button
                                onClick={() =>
                                  setMemberToDelete({
                                    principal: member.principal,
                                    username: member.username,
                                  })
                                }
                                size="sm"
                                variant="ghost"
                                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-xs">Delete</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No members found
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Current API Keys */}
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Key className="h-5 w-5 text-yellow-500" />
                  Current API Keys
                </CardTitle>
              </CardHeader>
              <CardContent>
                {apiKeysLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : apiKeys && apiKeys.length > 0 ? (
                  <div className="space-y-2">
                    {apiKeys.map((key) => {
                      const isCopied = copiedId === key.token;
                      return (
                        <div
                          key={key.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-background/60"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">
                              {key.description}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {getMaskedToken(key.token)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              onClick={() =>
                                handleCopyText(key.token, "API token")
                              }
                              size="sm"
                              variant="ghost"
                              className="gap-1.5"
                              data-ocid="apikeys.copy.button"
                            >
                              {isCopied ? (
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
                            <Button
                              onClick={() => setInfoKey(key)}
                              size="sm"
                              variant="ghost"
                              className="gap-1.5"
                              data-ocid="apikeys.info.button"
                            >
                              <Info className="h-3.5 w-3.5" />
                              <span className="text-xs">Info</span>
                            </Button>
                            <Button
                              onClick={() => setApiKeyToDelete(key)}
                              size="sm"
                              variant="ghost"
                              className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                              data-ocid="apikeys.delete_button"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="text-xs">Delete</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No API keys yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Add New Member */}
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Server className="h-5 w-5 text-green-500" />
                  Add New Member
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddMember} className="space-y-3">
                  <div className="flex gap-px">
                    <div className="w-32 flex-shrink-0">
                      <Select
                        value={selectedRole}
                        onValueChange={(value) =>
                          setSelectedRole(value as UserRole)
                        }
                        disabled={addMember.isPending}
                      >
                        <SelectTrigger className="rounded-r-none">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UserRole.admin}>
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              Admin
                            </div>
                          </SelectItem>
                          <SelectItem value={UserRole.user}>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              User
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Input
                        id="principalId"
                        type="text"
                        placeholder="Enter principal ID (e.g., rdmx6-jaaaa-aaaah-qcaiq-cai)"
                        value={principalId}
                        onChange={(e) => setPrincipalId(e.target.value)}
                        disabled={addMember.isPending}
                        className="font-mono text-sm rounded-l-none"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={addMember.isPending || !principalId.trim()}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {addMember.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Add
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Add New API Key */}
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Plus className="h-5 w-5 text-green-500" />
                  Add New API Key
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleGenerateApiKey} className="space-y-3">
                  <Input
                    type="text"
                    placeholder="e.g. plsak's key"
                    value={newKeyDescription}
                    onChange={(e) => setNewKeyDescription(e.target.value)}
                    disabled={generateApiKey.isPending}
                    data-ocid="apikeys.input"
                  />
                  <Button
                    type="submit"
                    disabled={
                      generateApiKey.isPending || !newKeyDescription.trim()
                    }
                    className="w-full gap-2"
                    size="lg"
                    data-ocid="apikeys.submit_button"
                  >
                    {generateApiKey.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Key className="h-4 w-4" />
                        Generate
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Separator />

            {/* Kody zaproszeń */}
            <Card className="bg-card/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Ticket className="h-5 w-5 text-violet-500" />
                    Kody zaproszeń
                  </CardTitle>
                  <Button
                    size="sm"
                    variant={showInviteForm ? "secondary" : "outline"}
                    className="gap-1.5"
                    onClick={() => {
                      setShowInviteForm((v) => !v);
                      setGeneratedCode(null);
                    }}
                    data-ocid="invite.open_modal_button"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Generuj kod
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Generate form */}
                {showInviteForm && (
                  <form
                    onSubmit={handleGenerateInviteCode}
                    className="space-y-3 p-3 rounded-lg bg-background/60 border border-border"
                  >
                    <p className="text-sm font-medium text-muted-foreground">
                      Parametry kodu (opcjonalne)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="invite-expires"
                          className="text-xs text-muted-foreground"
                        >
                          Data ważności
                        </label>
                        <input
                          id="invite-expires"
                          type="datetime-local"
                          value={inviteExpiresAt}
                          onChange={(e) => setInviteExpiresAt(e.target.value)}
                          disabled={generateInviteCode.isPending}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          data-ocid="invite.expires_input"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="invite-maxuses"
                          className="text-xs text-muted-foreground"
                        >
                          Limit użyć
                        </label>
                        <input
                          id="invite-maxuses"
                          type="number"
                          min="1"
                          placeholder="Bez limitu"
                          value={inviteMaxUses}
                          onChange={(e) => setInviteMaxUses(e.target.value)}
                          disabled={generateInviteCode.isPending}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          data-ocid="invite.max_uses_input"
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={generateInviteCode.isPending}
                      className="w-full gap-2"
                      data-ocid="invite.submit_button"
                    >
                      {generateInviteCode.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generowanie...
                        </>
                      ) : (
                        <>
                          <Ticket className="h-4 w-4" />
                          Wygeneruj kod
                        </>
                      )}
                    </Button>
                  </form>
                )}

                {/* Newly generated code alert */}
                {generatedCode && (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-violet-500/10 border border-violet-500/30">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">
                        Nowy kod zaproszenia
                      </p>
                      <p className="font-mono font-semibold text-sm break-all text-violet-500">
                        {generatedCode}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 flex-shrink-0"
                      onClick={() =>
                        handleCopyText(generatedCode, "Kod zaproszenia")
                      }
                      data-ocid="invite.copy_button"
                    >
                      {copiedId === generatedCode ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span className="text-xs">Skopiowano</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span className="text-xs">Kopiuj</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* Invite codes list */}
                {inviteCodesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : inviteCodes && inviteCodes.length > 0 ? (
                  <div className="space-y-2">
                    {inviteCodes.map((inviteCode: InviteCode, idx: number) => (
                      <div
                        key={inviteCode.code}
                        className="rounded-lg bg-background/60 border border-border overflow-hidden"
                        data-ocid={`invite.item.${idx + 1}`}
                      >
                        <div className="flex items-center justify-between px-3 py-2 gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold truncate">
                                {inviteCode.code}
                              </span>
                              {inviteCode.isActive ? (
                                <Badge
                                  variant="default"
                                  className="bg-green-500/20 text-green-600 border-green-500/30 hover:bg-green-500/30"
                                >
                                  Aktywny
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="bg-red-500/20 text-red-500 border-red-500/30 hover:bg-red-500/20"
                                >
                                  Unieważniony
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              <span className="text-xs text-muted-foreground">
                                Utworzony:{" "}
                                {formatInviteDate(inviteCode.createdAt)}
                              </span>
                              {inviteCode.expiresAt !== undefined && (
                                <span className="text-xs text-muted-foreground">
                                  Wygasa:{" "}
                                  {formatInviteDate(inviteCode.expiresAt)}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                Użyć:{" "}
                                <span className="font-medium text-foreground">
                                  {Number(inviteCode.usedCount)}
                                </span>
                                {inviteCode.maxUses !== undefined && (
                                  <span>/{Number(inviteCode.maxUses)}</span>
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1.5"
                              onClick={() =>
                                handleCopyText(
                                  inviteCode.code,
                                  "Kod zaproszenia",
                                )
                              }
                              data-ocid={`invite.copy.${idx + 1}`}
                            >
                              {copiedId === inviteCode.code ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            {inviteCode.usedBy.length > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1"
                                onClick={() =>
                                  setExpandedCode(
                                    expandedCode === inviteCode.code
                                      ? null
                                      : inviteCode.code,
                                  )
                                }
                                data-ocid={`invite.expand.${idx + 1}`}
                              >
                                {expandedCode === inviteCode.code ? (
                                  <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                            {inviteCode.isActive && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setCodeToRevoke(inviteCode.code)}
                                data-ocid={`invite.delete_button.${idx + 1}`}
                              >
                                <Ban className="h-3.5 w-3.5" />
                                <span className="text-xs">Unieważnij</span>
                              </Button>
                            )}
                          </div>
                        </div>
                        {/* Expanded: usedBy principals */}
                        {expandedCode === inviteCode.code &&
                          inviteCode.usedBy.length > 0 && (
                            <div className="px-3 pb-2 pt-0 border-t border-border">
                              <p className="text-xs text-muted-foreground mb-1.5 mt-2">
                                Użyto przez:
                              </p>
                              <div className="space-y-1">
                                {inviteCode.usedBy.map((principal) => (
                                  <div
                                    key={principal.toString()}
                                    className="flex items-center gap-2"
                                  >
                                    <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    <span className="text-xs font-mono text-muted-foreground break-all">
                                      {getShortenedPrincipal(
                                        principal.toString(),
                                      )}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-5 w-5 p-0"
                                      onClick={() =>
                                        handleCopyText(
                                          principal.toString(),
                                          "Principal ID",
                                        )
                                      }
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p
                    className="text-sm text-muted-foreground text-center py-4"
                    data-ocid="invite.empty_state"
                  >
                    Brak wygenerowanych kodów zaproszeń
                  </p>
                )}
              </CardContent>
            </Card>

            <Separator />

            {/* App Version */}
            <Card className="bg-card/50 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">
                    App Version:
                  </span>
                  <span className="text-lg font-semibold text-primary">
                    {APP_VERSION}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Member Confirmation Dialog */}
      <AlertDialog
        open={!!memberToDelete}
        onOpenChange={(open) => !open && setMemberToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>{memberToDelete?.username}</strong>? This will remove
              their profile, roles, and approval status. They will be logged out
              and treated as a new user on next login. Their uploaded files and
              folders will remain available to all members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMember.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMember}
              disabled={removeMember.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMember.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Removing...
                </>
              ) : (
                "Remove"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete API Key Confirmation Dialog */}
      <AlertDialog
        open={!!apiKeyToDelete}
        onOpenChange={(open) => !open && setApiKeyToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the API key{" "}
              <strong>{apiKeyToDelete?.description}</strong>? Any scripts or
              integrations using this key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteApiKey.isPending}
              data-ocid="apikeys.cancel_button"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteApiKey}
              disabled={deleteApiKey.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-ocid="apikeys.confirm_button"
            >
              {deleteApiKey.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Invite Code Confirmation */}
      <AlertDialog
        open={!!codeToRevoke}
        onOpenChange={(open) => !open && setCodeToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unieważnij kod zaproszenia</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz unieważnij kod{" "}
              <strong className="font-mono">{codeToRevoke}</strong>? Kod
              przestanie działać natychmiastowo i nowi użytkownicy nie będą
              mogli się nim zalogować.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={revokeInviteCode.isPending}
              data-ocid="invite.cancel_button"
            >
              Anuluj
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeInviteCode}
              disabled={revokeInviteCode.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-ocid="invite.confirm_button"
            >
              {revokeInviteCode.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Unieważnianie...
                </>
              ) : (
                "Unieważnij"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* API Key Info Dialog */}
      {infoKey && (
        <Dialog
          open={!!infoKey}
          onOpenChange={(open) => !open && setInfoKey(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-yellow-500" />
                API Key Usage
              </DialogTitle>
              <DialogDescription>
                Use these examples to upload files via curl or wget.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-1 font-medium">Upload a file (&lt; 2 MB):</p>
                <div className="relative">
                  <pre className="bg-muted rounded-md p-3 overflow-x-auto text-xs font-mono whitespace-pre">
                    {getInfoSnippets(infoKey).snippet1}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-1 right-1 gap-1"
                    onClick={() =>
                      handleCopyText(
                        getInfoSnippets(infoKey).snippet1,
                        "snippet",
                      )
                    }
                  >
                    {copiedId === getInfoSnippets(infoKey).snippet1 ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <div>
                <p className="mb-1 font-medium">Upload to a specific folder:</p>
                <div className="relative">
                  <pre className="bg-muted rounded-md p-3 overflow-x-auto text-xs font-mono whitespace-pre">
                    {getInfoSnippets(infoKey).snippet2}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-1 right-1 gap-1"
                    onClick={() =>
                      handleCopyText(
                        getInfoSnippets(infoKey).snippet2,
                        "snippet",
                      )
                    }
                  >
                    {copiedId === getInfoSnippets(infoKey).snippet2 ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                <strong>Note:</strong> CLI-uploaded files are stored directly in
                canister memory, which has limited capacity — avoid uploading
                large files or large numbers of files via CLI. In-app file
                encryption is not available for CLI uploads; you can however
                upload locally encrypted files (e.g. encrypted with gpg) without
                any restrictions.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
