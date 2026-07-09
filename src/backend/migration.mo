// Migration: add ownerId : Principal to FileMetadata and FolderMetadata.
// Legacy records (without ownerId) are assigned an owner of:
//   firstAdmin if non-null, else adminPrincipal.value.
// All other stable fields are preserved unchanged.
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Storage "mo:caffeineai-object-storage/Storage";
import AccessControl "mo:caffeineai-authorization/access-control";
import UserApproval "mo:caffeineai-user-approval/approval";

module {
  // ---- Old types (inline, copied from .old/src/backend/main.mo) ----

  public type OldFileMetadata = {
    id : Text;
    name : Text;
    size : Nat;
    blob : Storage.ExternalBlob;
    parentId : ?Text;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type OldFolderMetadata = {
    id : Text;
    name : Text;
    parentId : ?Text;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type OldApiKey = {
    id : Text;
    token : Text;
    description : Text;
    ownerId : Principal;
    createdAt : Time.Time;
  };

  public type OldUserProfile = {
    name : Text;
  };

  public type OldInviteCode = {
    code : Text;
    createdAt : Time.Time;
    expiresAt : ?Time.Time;
    maxUses : ?Nat;
    usedCount : Nat;
    usedBy : [Principal];
    isActive : Bool;
    createdBy : Principal;
  };

  // OldActor mirrors the previously deployed stable signature exactly.
  // `files` / `folders` / `apiKeys` / `encryptedFiles` / `cliFileBytes` /
  // `inviteCodes` / `userProfiles` / `accessControlState` / `approvalState`
  // are let-bound Maps; the rest are `var`. `adminPrincipal` is a record
  // with a `var value` field.
  public type OldActor = {
    accessControlState : AccessControl.AccessControlState;
    approvalState : UserApproval.UserApprovalState;
    userProfiles : Map.Map<Principal, OldUserProfile>;
    var frontendCanisterId : Text;
    var backendCanisterId : Text;
    var firstAdmin : ?Principal;
    var appVersion : Text;
    var nextFolderId : Nat;
    var nextApiKeyId : Nat;
    files : Map.Map<Text, OldFileMetadata>;
    folders : Map.Map<Text, OldFolderMetadata>;
    apiKeys : Map.Map<Text, OldApiKey>;
    encryptedFiles : Map.Map<Text, Bool>;
    cliFileBytes : Map.Map<Text, Blob>;
    inviteCodes : Map.Map<Text, OldInviteCode>;
    adminPrincipal : { var value : ?Principal };
    var tokenCounter : Nat;
  };

  // ---- New types (mirror the new main.mo stable types) ----

  public type NewFileMetadata = {
    id : Text;
    name : Text;
    size : Nat;
    blob : Storage.ExternalBlob;
    parentId : ?Text;
    ownerId : Principal;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type NewFolderMetadata = {
    id : Text;
    name : Text;
    parentId : ?Text;
    ownerId : Principal;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type NewActor = {
    accessControlState : AccessControl.AccessControlState;
    approvalState : UserApproval.UserApprovalState;
    userProfiles : Map.Map<Principal, OldUserProfile>;
    var frontendCanisterId : Text;
    var backendCanisterId : Text;
    var firstAdmin : ?Principal;
    var appVersion : Text;
    var nextFolderId : Nat;
    var nextApiKeyId : Nat;
    files : Map.Map<Text, NewFileMetadata>;
    folders : Map.Map<Text, NewFolderMetadata>;
    apiKeys : Map.Map<Text, OldApiKey>;
    encryptedFiles : Map.Map<Text, Bool>;
    cliFileBytes : Map.Map<Text, Blob>;
    inviteCodes : Map.Map<Text, OldInviteCode>;
    adminPrincipal : { var value : ?Principal };
    var tokenCounter : Nat;
  };

  // Resolve the legacy owner: firstAdmin if present, else adminPrincipal.value.
  // If both are null (no admin configured yet), fall back to the management
  // canister id `aaaaa-aa` — a valid, non-anonymous, well-formed Principal.
  // We must NOT use Principal.fromText("") or the anonymous principal here:
  // both are too short and trigger `blob_of_principal: principal too short`
  // at install_code time.
  func legacyOwner(old : OldActor) : Principal {
    switch (old.firstAdmin) {
      case (?p) { p };
      case (null) {
        switch (old.adminPrincipal.value) {
          case (?p) { p };
          case (null) { Principal.fromText("aaaaa-aa") };
        };
      };
    };
  };

  public func run(old : OldActor) : NewActor {
    let owner = legacyOwner(old);

    let files = old.files.map<Text, OldFileMetadata, NewFileMetadata>(
      func(_, f) {
        {
          f with
          ownerId = owner;
        };
      }
    );

    let folders = old.folders.map<Text, OldFolderMetadata, NewFolderMetadata>(
      func(_, f) {
        {
          f with
          ownerId = owner;
        };
      }
    );

    {
      accessControlState = old.accessControlState;
      approvalState = old.approvalState;
      userProfiles = old.userProfiles;
      var frontendCanisterId = old.frontendCanisterId;
      var backendCanisterId = old.backendCanisterId;
      var firstAdmin = old.firstAdmin;
      var appVersion = old.appVersion;
      var nextFolderId = old.nextFolderId;
      var nextApiKeyId = old.nextApiKeyId;
      files;
      folders;
      apiKeys = old.apiKeys;
      encryptedFiles = old.encryptedFiles;
      cliFileBytes = old.cliFileBytes;
      inviteCodes = old.inviteCodes;
      adminPrincipal = old.adminPrincipal;
      var tokenCounter = old.tokenCounter;
    };
  };
};
