import type { Principal } from "@icp-sdk/core/principal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExternalBlob } from "../backend";
import type {
  AccessCheckResult,
  AdminInfo,
  FileMetadata,
  FileMove,
  FileSystemItem,
  FolderMetadata,
  InviteCode,
  InviteResult,
  StorageStats,
  UserProfile,
  UserRole,
} from "../backend";
export type { InviteCode };

// ApiKey type mirrors backend.d.ts declaration
export interface ApiKey {
  id: string;
  token: string;
  description: string;
  ownerId: import("@icp-sdk/core/principal").Principal;
  createdAt: bigint;
}
import { createActor } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { containsNormalized } from "../lib/searchNormalize";
import { buildSubtreeFolderIds } from "../lib/subtreeIndex";

export function useGetCallerUserRole() {
  const { actor, isFetching: actorFetching } = useActor(createActor);

  return useQuery<UserRole>({
    queryKey: ["callerUserRole"],
    queryFn: async () => {
      if (!actor) throw new Error("Actor not available");
      return actor.getCallerUserRole();
    },
    enabled: !!actor && !actorFetching,
  });
}

export function useIsCallerApproved() {
  const { actor, isFetching: actorFetching } = useActor(createActor);

  return useQuery<boolean>({
    queryKey: ["callerApproved"],
    queryFn: async () => {
      if (!actor) throw new Error("Actor not available");
      return actor.isCallerApproved();
    },
    enabled: !!actor && !actorFetching,
  });
}

// Derived access: user must be admin OR (user role AND approved)
export function useEffectiveAccess() {
  const { data: userRole, isLoading: roleLoading } = useGetCallerUserRole();
  const { data: isApproved, isLoading: approvalLoading } =
    useIsCallerApproved();

  const isLoading = roleLoading || approvalLoading;
  const hasAccess =
    userRole === "admin" || (userRole === "user" && isApproved === true);

  return { hasAccess, isLoading };
}

export function useGetCallerUserProfile() {
  const { actor, isFetching: actorFetching } = useActor(createActor);
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  const query = useQuery<UserProfile | null>({
    queryKey: ["currentUserProfile"],
    queryFn: async () => {
      if (!actor) throw new Error("Actor not available");
      return actor.getCallerUserProfile();
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess,
    retry: false,
  });

  return {
    ...query,
    isLoading: actorFetching || accessLoading || query.isLoading,
    isFetched: !!actor && !accessLoading && hasAccess && query.isFetched,
  };
}

export function useSaveCallerUserProfile() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: UserProfile) => {
      if (!actor) throw new Error("Actor not available");
      return actor.saveCallerUserProfile(profile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUserProfile"] });
    },
  });
}

export function useIsUsernameUnique() {
  const { actor } = useActor(createActor);

  return useMutation({
    mutationFn: async (username: string) => {
      if (!actor) throw new Error("Actor not available");
      return actor.isUsernameUnique(username);
    },
  });
}

export function useRequestApproval() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Actor not available");
      return actor.requestApproval();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["callerApproved"] });
    },
  });
}

export function useGetFiles() {
  const { actor, isFetching: actorFetching } = useActor(createActor);
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  return useQuery<FileMetadata[]>({
    queryKey: ["files"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getFiles();
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess,
    retry: false,
  });
}

export function useSearchFiles(searchTerm: string) {
  const { actor, isFetching: actorFetching } = useActor(createActor);
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  return useQuery<FileMetadata[]>({
    queryKey: ["files", "search", searchTerm],
    queryFn: async () => {
      if (!actor) return [];
      if (!searchTerm.trim()) {
        return actor.getFiles();
      }
      return actor.searchFiles(searchTerm);
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess,
    retry: false,
  });
}

/**
 * Client-side recursive subtree search with Unicode-aware, case-insensitive, diacritics-insensitive matching.
 * Searches folder and file names only (not content) within the current folder subtree.
 * Now includes files in descendant subfolders.
 */
export function useSearchSubtree(
  searchTerm: string,
  startFolderId: string | null,
) {
  const { actor, isFetching: actorFetching } = useActor(createActor);
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  const trimmedTerm = searchTerm.trim();

  return useQuery<FileSystemItem[]>({
    queryKey: ["subtreeSearch", startFolderId, trimmedTerm],
    queryFn: async () => {
      if (!actor || !trimmedTerm) return [];

      // Fetch all folders and files
      const [allFolders, allFiles] = await Promise.all([
        actor.getAllFolders(),
        actor.getFiles(),
      ]);

      // Build a set of folder IDs that are in the current subtree
      const subtreeFolderIds = buildSubtreeFolderIds(allFolders, startFolderId);

      // Filter folders: must be in subtree and match search term
      const matchingFolders = allFolders.filter((folder) => {
        // Check if folder is in the correct subtree
        let isInSubtree: boolean;
        if (startFolderId === null) {
          // If searching from root, include all folders
          isInSubtree = true;
        } else {
          // Folder must be the start folder itself, or in its subtree, or a direct child
          isInSubtree =
            folder.id === startFolderId ||
            subtreeFolderIds.has(folder.id) ||
            folder.parentId === startFolderId;
        }

        if (!isInSubtree) return false;

        // Check if name matches search term (Unicode-aware, case-insensitive, diacritics-insensitive)
        return containsNormalized(folder.name, trimmedTerm);
      });

      // Filter files: must be in current folder OR any descendant folder, and match search term
      const matchingFiles = allFiles.filter((file) => {
        // Check if file is in the correct subtree
        let isInSubtree: boolean;
        if (startFolderId === null) {
          // When searching from root, include files from ALL folders (not just root-level files)
          // A file is in the subtree if it has no parent (root-level) OR its parent is any folder
          isInSubtree =
            file.parentId === null ||
            file.parentId === undefined ||
            subtreeFolderIds.has(file.parentId);
        } else {
          // File must be in the current folder OR in any descendant folder
          isInSubtree =
            file.parentId === startFolderId ||
            (!!file.parentId && subtreeFolderIds.has(file.parentId));
        }

        if (!isInSubtree) return false;

        // Check if name matches search term (Unicode-aware, case-insensitive, diacritics-insensitive)
        return containsNormalized(file.name, trimmedTerm);
      });

      // Combine results
      const results: FileSystemItem[] = [
        ...matchingFolders.map((folder) => ({
          __kind__: "folder" as const,
          folder,
        })),
        ...matchingFiles.map((file) => ({ __kind__: "file" as const, file })),
      ];

      return results;
    },
    enabled:
      !!actor && !actorFetching && !accessLoading && hasAccess && !!trimmedTerm,
    retry: false,
  });
}

export function useAddFile() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      size,
      blob,
      parentId,
      isEncrypted,
    }: {
      id: string;
      name: string;
      size: bigint;
      blob: ExternalBlob;
      parentId: string | null;
      isEncrypted: boolean;
    }) => {
      if (!actor) throw new Error("Actor not available");
      return actor.addFile(id, name, size, parentId, blob, isEncrypted);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["folderContents"] });
      queryClient.invalidateQueries({ queryKey: ["subtreeSearch"] });
      queryClient.invalidateQueries({ queryKey: ["storageStats"] });
    },
  });
}

export function useDeleteFile() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!actor) throw new Error("Actor not available");
      return actor.deleteFile(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["folderContents"] });
      queryClient.invalidateQueries({ queryKey: ["subtreeSearch"] });
      queryClient.invalidateQueries({ queryKey: ["storageStats"] });
    },
  });
}

export function useGetMembers() {
  const { actor, isFetching: actorFetching } = useActor(createActor);
  const { data: userRole } = useGetCallerUserRole();

  // Only enable if user is admin
  const isAdmin = userRole === "admin";

  return useQuery<AdminInfo[]>({
    queryKey: ["members"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getMembers();
    },
    enabled: !!actor && !actorFetching && isAdmin,
    retry: false,
  });
}

export function useAddMember() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      principal,
      role,
    }: { principal: Principal; role: UserRole }) => {
      if (!actor) throw new Error("Actor not available");
      return actor.assignCallerUserRole(principal, role);
    },
    onSuccess: async () => {
      // Invalidate and actively refetch members list
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      await queryClient.refetchQueries({ queryKey: ["members"] });

      // Also invalidate approval-related queries in case the added user is currently logged in
      queryClient.invalidateQueries({ queryKey: ["callerApproved"] });
      queryClient.invalidateQueries({ queryKey: ["callerUserRole"] });
    },
  });
}

export function useRemoveMember() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (principal: Principal) => {
      if (!actor) throw new Error("Actor not available");
      return actor.removeMember(principal);
    },
    onSuccess: async () => {
      // Invalidate and actively refetch members list
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      await queryClient.refetchQueries({ queryKey: ["members"] });
    },
  });
}

export function useGetStorageStats() {
  const { actor, isFetching: actorFetching } = useActor(createActor);
  const { data: userRole } = useGetCallerUserRole();

  // Only enable if user is admin
  const isAdmin = userRole === "admin";

  return useQuery<StorageStats>({
    queryKey: ["storageStats"],
    queryFn: async () => {
      if (!actor) throw new Error("Actor not available");
      return actor.getStorageStats();
    },
    enabled: !!actor && !actorFetching && isAdmin,
    retry: false,
  });
}

export function useSetFrontendCanisterId() {
  const { actor } = useActor(createActor);

  return useMutation({
    mutationFn: async (canisterId: string) => {
      if (!actor) throw new Error("Actor not available");
      return actor.setFrontendCanisterId(canisterId);
    },
  });
}

// Folder Management Hooks

export function useCreateFolder() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      parentId,
    }: { name: string; parentId: string | null }) => {
      if (!actor) throw new Error("Actor not available");
      return actor.createFolder(name, parentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folderContents"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["subtreeSearch"] });
      queryClient.invalidateQueries({ queryKey: ["storageStats"] });
    },
  });
}

export function useDeleteFolder() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!actor) throw new Error("Actor not available");
      return actor.deleteFolder(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folderContents"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["subtreeSearch"] });
      queryClient.invalidateQueries({ queryKey: ["storageStats"] });
    },
  });
}

export function useGetFolderContents(folderId: string | null) {
  const { actor, isFetching: actorFetching } = useActor(createActor);
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  return useQuery<FileSystemItem[]>({
    queryKey: ["folderContents", folderId],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getFolderContents(folderId);
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess,
    retry: false,
  });
}

export function useGetAllFolders() {
  const { actor, isFetching: actorFetching } = useActor(createActor);
  const { hasAccess, isLoading: accessLoading } = useEffectiveAccess();

  return useQuery<FolderMetadata[]>({
    queryKey: ["folders"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getAllFolders();
    },
    enabled: !!actor && !actorFetching && !accessLoading && hasAccess,
    retry: false,
  });
}

export function useMoveItem() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      newParentId,
      isFolder,
    }: { itemId: string; newParentId: string | null; isFolder: boolean }) => {
      if (!actor) throw new Error("Actor not available");
      return actor.moveItem(itemId, newParentId, isFolder);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folderContents"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["subtreeSearch"] });
      queryClient.invalidateQueries({ queryKey: ["storageStats"] });
    },
  });
}

export function useMoveItems() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (moves: FileMove[]) => {
      if (!actor) throw new Error("Actor not available");
      return actor.moveItems(moves);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folderContents"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["subtreeSearch"] });
      queryClient.invalidateQueries({ queryKey: ["storageStats"] });
    },
  });
}

// API Key Management Hooks

export function useListApiKeys() {
  const { actor, isFetching: actorFetching } = useActor(createActor);
  const { data: userRole } = useGetCallerUserRole();

  const isAdmin = userRole === "admin";

  return useQuery<ApiKey[]>({
    queryKey: ["apiKeys"],
    queryFn: async () => {
      if (!actor) return [];
      return (actor as any).listApiKeys();
    },
    enabled: !!actor && !actorFetching && isAdmin,
    retry: false,
  });
}

export function useGenerateApiKey() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (description: string) => {
      if (!actor) throw new Error("Actor not available");
      return (actor as any).generateApiKey(description);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });
}

export function useDeleteApiKey() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!actor) throw new Error("Actor not available");
      return (actor as any).deleteApiKey(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });
}

// Invite Link & Admin Bootstrap Hooks

export function useCheckAccess() {
  const { actor, isFetching: actorFetching } = useActor(createActor);

  return useQuery<AccessCheckResult>({
    queryKey: ["checkAccess"],
    queryFn: async () => {
      if (!actor) throw new Error("Actor not available");
      return actor.checkAccess();
    },
    enabled: !!actor && !actorFetching,
    retry: false,
  });
}

export function useRedeemInviteCode() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation<InviteResult, Error, string>({
    mutationFn: async (code: string) => {
      if (!actor) throw new Error("Actor not available");
      return actor.redeemInviteCode(code);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkAccess"] });
      queryClient.invalidateQueries({ queryKey: ["callerApproved"] });
      queryClient.invalidateQueries({ queryKey: ["callerUserRole"] });
    },
  });
}

export function useValidateInviteCode() {
  const { actor } = useActor(createActor);

  return useMutation<boolean, Error, string>({
    mutationFn: async (code: string) => {
      if (!actor) throw new Error("Actor not available");
      return actor.validateInviteCode(code);
    },
  });
}

export function useGenerateInviteCode() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    { expiresAt: bigint | null; maxUses: bigint | null }
  >({
    mutationFn: async ({ expiresAt, maxUses }) => {
      if (!actor) throw new Error("Actor not available");
      return actor.generateInviteCode(expiresAt, maxUses);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inviteCodes"] });
    },
  });
}

export function useListInviteCodes() {
  const { actor, isFetching: actorFetching } = useActor(createActor);

  return useQuery<InviteCode[]>({
    queryKey: ["inviteCodes"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listInviteCodes();
    },
    enabled: !!actor && !actorFetching,
    retry: false,
  });
}

export function useRevokeInviteCode() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation<InviteResult, Error, string>({
    mutationFn: async (code: string) => {
      if (!actor) throw new Error("Actor not available");
      return actor.revokeInviteCode(code);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inviteCodes"] });
    },
  });
}

export function useSetAdmin() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  return useMutation<InviteResult, Error, Principal>({
    mutationFn: async (principal: Principal) => {
      if (!actor) throw new Error("Actor not available");
      return actor.setAdmin(principal);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["callerUserRole"] });
      queryClient.invalidateQueries({ queryKey: ["checkAccess"] });
    },
  });
}

export function useGetAdmin() {
  const { actor, isFetching: actorFetching } = useActor(createActor);

  return useQuery<Principal | null>({
    queryKey: ["admin"],
    queryFn: async () => {
      if (!actor) throw new Error("Actor not available");
      return actor.getAdmin();
    },
    enabled: !!actor && !actorFetching,
    retry: false,
  });
}
