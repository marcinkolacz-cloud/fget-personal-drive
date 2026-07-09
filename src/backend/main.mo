import MixinObjectStorage "mo:caffeineai-object-storage/Mixin";
import Storage "mo:caffeineai-object-storage/Storage";
import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import UserApproval "mo:caffeineai-user-approval/approval";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Nat8 "mo:core/Nat8";
import Random "mo:core/Random";

import MixinViews "mo:caffeineai-data-viewer/MixinViews";
import InviteLinksMixin "mixins/invite-links-api";
import InviteLinksTypes "types/invite-links";
import InviteLinksLib "lib/invite-links";



actor self {
  include MixinObjectStorage();
  include MixinViews();

  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState, null);
  let approvalState = UserApproval.initState(accessControlState);

  let userProfiles = Map.empty<Principal, UserProfile>();
  var frontendCanisterId : Text = "";
  var backendCanisterId : Text = "";
  var firstAdmin : ?Principal = null;
  var appVersion = "0.6.195";
  var nextFolderId = 1;
  var nextApiKeyId = 1;
  let files = Map.empty<Text, FileMetadata>();
  let folders = Map.empty<Text, FolderMetadata>();
  let apiKeys = Map.empty<Text, ApiKey>();
  // Separate map tracking which file IDs are encrypted (avoids stable type migration)
  let encryptedFiles = Map.empty<Text, Bool>();
  // Separate map storing raw bytes for CLI-uploaded files (keyed by fileId)
  // IMPORTANT: CLI files use "!cli!<fileId>" as blob sentinel in FileMetadata
  let cliFileBytes = Map.empty<Text, Blob>();
  let inviteCodes = Map.empty<Text, InviteLinksTypes.InviteCode>();
  let adminPrincipal : { var value : ?Principal } = { var value = null };
  include InviteLinksMixin(adminPrincipal, inviteCodes, accessControlState, approvalState);

  public type UserProfile = {
    name : Text;
  };

  public type FileMetadata = {
    id : Text;
    name : Text;
    size : Nat;
    blob : Storage.ExternalBlob;
    parentId : ?Text;
    ownerId : Principal;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type FolderMetadata = {
    id : Text;
    name : Text;
    parentId : ?Text;
    ownerId : Principal;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type ApiKey = {
    id : Text;
    token : Text;
    description : Text;
    ownerId : Principal;
    createdAt : Time.Time;
  };

  public type AdminInfo = {
    principal : Principal;
    username : Text;
    role : AccessControl.UserRole;
  };

  public type StorageStats = {
    totalStorageBytes : Nat;
    totalFolders : Nat;
    totalFiles : Nat;
    totalEncryptedFiles : Nat;
    backendCanisterId : Text;
    frontendCanisterId : Text;
    appVersion : Text;
  };

  public type FileSystemItem = {
    #file : FileMetadata;
    #folder : FolderMetadata;
  };

  public type SearchResult = {
    name : Text;
    fullPath : Text;
    isFolder : Bool;
    id : Text;
  };

  public type FolderSearchResults = {
    folders : [FolderMetadata];
    files : [FileMetadata];
  };

  public type FileMove = {
    id : Text;
    newParentId : ?Text;
    isFolder : Bool;
  };

  // Counter reused for folder IDs and CLI file IDs elsewhere in this actor.
  // NOTE: generateToken no longer consumes tokenCounter — it draws entropy
  // from mo:core/Random (IC management canister raw_rand) instead of the old
  // Time.now()+tokenCounter LCG. The variable stays for its other uses.
  var tokenCounter : Nat = 0;
  func generateToken() : async Text {
    // Fetch 16 cryptographically-secure random bytes from the IC management
    // canister (raw_rand). 16 bytes -> 32 hex characters, so a single round
    // trip supplies all the entropy needed for the token.
    let entropy = Blob.toArray(await Random.blob());
    let hex = "0123456789abcdef";
    let hexChars = hex.chars().toArray();
    var result = "fget_";
    var i = 0;
    while (i < 32) {
      // Each hex char comes from 4 secure bits of a random byte.
      let byte = entropy[i / 2].toNat();
      let idx = if (i % 2 == 0) { byte / 16 } else { byte % 16 };
      result #= hexChars[idx].toText();
      i += 1;
    };
    result;
  };

  // Validate API token and return owning principal if valid
  func validateApiToken(token : Text) : ?Principal {
    for ((_, key) in apiKeys.entries()) {
      if (key.token == token) {
        return ?key.ownerId;
      };
    };
    null;
  };

  // Two-tier admin check: AccessControl #admin role OR the invite-links admin.
  // Admins bypass per-user ownership isolation (full visibility / delete / move).
  func callerIsAdmin(caller : Principal) : Bool {
    AccessControl.hasPermission(accessControlState, caller, #admin) or InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller);
  };

  // Resolve or create nested folder path like "aaa/bbb/ccc" and return the leaf folder ID.
  // Newly created folders are owned by `owner` (the CLI upload caller).
  func resolveOrCreateFolderPath(path : Text, owner : Principal) : Text {
    // Split path on "/"
    let segments = path.split(#char '/');
    var currentParentId : ?Text = null;

    for (segment in segments) {
      let trimmed = segment.trim(#text " ");
      if (trimmed != "") {
        // Look for existing folder with this name under currentParentId
        var found : ?Text = null;
        for ((_, folder) in folders.entries()) {
          if (folder.name == trimmed and folder.parentId == currentParentId and folder.ownerId == owner) {
            found := ?folder.id;
          };
        };
        let folderId = switch (found) {
          case (?id) { id };
          case (null) {
            // Create new folder at this level
            let newId = "folder_" # Int.abs(Time.now()).toText() # "_" # tokenCounter.toText();
            tokenCounter += 1;
            let now = Time.now();
            let newFolder : FolderMetadata = {
              id = newId;
              name = trimmed;
              parentId = currentParentId;
              ownerId = owner;
              createdAt = now;
              updatedAt = now;
            };
            folders.add(newId, newFolder);
            newId;
          };
        };
        currentParentId := ?folderId;
      };
    };

    // Return the leaf folder id (currentParentId must be ?Text at this point)
    switch (currentParentId) {
      case (?id) { id };
      case (null) { Runtime.trap("Empty folder path") };
    };
  };

  // HTTP interface for curl/wget uploads
  public query func http_request(req : { method : Text; url : Text; headers : [(Text, Text)]; body : Blob }) : async {
    status_code : Nat16;
    headers : [(Text, Text)];
    body : Blob;
    upgrade : ?Bool;
  } {
    if (req.method == "POST") {
      // Upgrade to update call for POST requests
      {
        status_code = 204;
        headers = [];
        body = "".encodeUtf8();
        upgrade = ?true;
      };
    } else if (req.method == "GET") {
      // Serve CLI-uploaded files via GET /file/<id>
      // URL format: /file/<fileId>
      // NOTE: This endpoint is intentionally public (no auth check) because it's accessed via
      // raw.icp0.io URLs that are meant to be shareable download links.
      // The security model relies on file IDs being cryptographically unpredictable:
      // each ID is derived from 16 random bytes (32 hex chars) sourced from the IC
      // management canister's raw_rand via mo:core/Random, prefixed with "api_".
      let url = req.url;
      let prefix = "/file/";
      if (url.startsWith(#text prefix)) {
        let fileId = url.trimStart(#text prefix);
        // Strip query string if present
        let cleanId = switch (fileId.split(#char '?').next()) {
          case (?id) { id };
          case (null) { fileId };
        };
        // Serve raw bytes for CLI-uploaded files from cliFileBytes map
        switch (files.get(cleanId)) {
          case (null) {
            {
              status_code = 404;
              headers = [("Content-Type", "text/plain")];
              body = "File not found".encodeUtf8();
              upgrade = null;
            };
          };
          case (?file) {
            switch (cliFileBytes.get(cleanId)) {
              case (null) {
                {
                  status_code = 404;
                  headers = [("Content-Type", "text/plain")];
                  body = "File bytes not found".encodeUtf8();
                  upgrade = null;
                };
              };
              case (?bytes) {
                {
                  status_code = 200;
                  headers = [
                    ("Content-Type", "application/octet-stream"),
                    ("Content-Disposition", "attachment; filename=\"" # file.name # "\""),
                    ("Content-Length", file.size.toText()),
                  ];
                  body = bytes;
                  upgrade = null;
                };
              };
            };
          };
        };
      } else {
        {
          status_code = 404;
          headers = [("Content-Type", "text/plain")];
          body = "Not Found".encodeUtf8();
          upgrade = null;
        };
      };
    } else {
      {
        status_code = 405;
        headers = [("Content-Type", "text/plain")];
        body = "Method Not Allowed".encodeUtf8();
        upgrade = null;
      };
    };
  };

  public func http_request_update(req : { method : Text; url : Text; headers : [(Text, Text)]; body : Blob }) : async {
    status_code : Nat16;
    headers : [(Text, Text)];
    body : Blob;
  } {
    if (req.method != "POST") {
      return {
        status_code = 405;
        headers = [("Content-Type", "text/plain")];
        body = "Method Not Allowed".encodeUtf8();
      };
    };

    // Extract API token from headers
    var apiToken : ?Text = null;
    var filename : ?Text = null;
    var folderPath : ?Text = null;

    for ((name, value) in req.headers.vals()) {
      let lower = name.toLower();
      if (lower == "x-api-token") { apiToken := ?value };
      if (lower == "x-filename") { filename := ?value };
      if (lower == "x-folder") { folderPath := ?value };
    };

    // Validate token
    let callerPrincipal = switch (apiToken) {
      case (null) {
        return {
          status_code = 401;
          headers = [("Content-Type", "text/plain")];
          body = "Unauthorized: Missing X-API-Token header".encodeUtf8();
        };
      };
      case (?token) {
        switch (validateApiToken(token)) {
          case (null) {
            return {
              status_code = 401;
              headers = [("Content-Type", "text/plain")];
              body = "Unauthorized: Invalid API token".encodeUtf8();
            };
          };
          case (?principal) { principal };
        };
      };
    };

    // Check caller is approved (must have user or admin role, not guest)
    if (not AccessControl.hasPermission(accessControlState, callerPrincipal, #user)) {
      return {
        status_code = 403;
        headers = [("Content-Type", "text/plain")];
        body = "Forbidden: Account not approved".encodeUtf8();
      };
    };

    // Get filename
    let fname = switch (filename) {
      case (null) { "upload" };
      case (?n) { n };
    };

    // Resolve folder ID from path — handles nested paths like "aaa/bbb/ccc"
    let parentFolderId : ?Text = switch (folderPath) {
      case (null) { null };
      case (?path) {
        let trimmedPath = path.trim(#text " ");
        if (trimmedPath == "") {
          null;
        } else {
          ?resolveOrCreateFolderPath(trimmedPath, callerPrincipal);
        };
      };
    };

    // Store file with !cli!<fileId> sentinel so frontend can build a stable public URL
    // IMPORTANT: raw bytes go in cliFileBytes map; blob field stores only the sentinel string
    let fileSize = req.body.size();
    // Generate a cryptographically-secure fileId from 16 random bytes (32 hex chars)
    // sourced from the IC management canister's raw_rand via mo:core/Random.
    // The "api_" prefix is preserved so the frontend "!cli!<fileId>" sentinel
    // logic continues to recognise CLI-uploaded files.
    let entropy = Blob.toArray(await Random.blob());
    let hex = "0123456789abcdef";
    let hexChars = hex.chars().toArray();
    var fileId = "api_";
    var i = 0;
    while (i < 32) {
      let byte = entropy[i / 2].toNat();
      let idx = if (i % 2 == 0) { byte / 16 } else { byte % 16 };
      fileId #= hexChars[idx].toText();
      i += 1;
    };

    // Store raw bytes separately keyed by fileId
    cliFileBytes.add(fileId, req.body);

    let now = Time.now();
    let metadata : FileMetadata = {
      id = fileId;
      name = fname;
      size = fileSize;
      // !cli!<fileId> sentinel — frontend detects this and builds the stable icp0.io URL
      // DO NOT change this to store raw bytes — it breaks the frontend downloadFile logic
      blob = ("!cli!" # fileId).encodeUtf8();
      parentId = parentFolderId;
      ownerId = callerPrincipal;
      createdAt = now;
      updatedAt = now;
    };
    files.add(fileId, metadata);
    // CLI uploads are never encrypted

    let selfCanisterId = Principal.fromActor(self).toText();
    let downloadUrl = "https://" # selfCanisterId # ".raw.icp0.io/file/" # fileId;
    {
      status_code = 200;
      headers = [("Content-Type", "application/json")];
      body = ("{\"id\":\"" # fileId # "\",\"name\":\"" # fname # "\",\"size\":" # fileSize.toText() # ",\"url\":\"" # downloadUrl # "\"}").encodeUtf8();
    };
  };

  // Approval Functions
  // isCallerAdmin provided by caffeineai-authorization/MixinAuthorization.mo mixin

  public query ({ caller }) func isCallerApproved() : async Bool {
    getEffectiveRole(caller) != #guest;
  };

  public shared ({ caller }) func requestApproval() : async () {
    UserApproval.requestApproval(approvalState, caller : Principal);
  };

  public shared ({ caller }) func setApproval(user : Principal, status : UserApproval.ApprovalStatus) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #admin) and not InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller)) {
      Runtime.trap("Unauthorized: Only admins can perform this action");
    };
    UserApproval.setApproval(approvalState, user, status);
  };

  public query ({ caller }) func listApprovals() : async [UserApproval.UserApprovalInfo] {
    if (not AccessControl.hasPermission(accessControlState, caller, #admin) and not InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller)) {
      Runtime.trap("Unauthorized: Only admins can perform this action");
    };
    UserApproval.listApprovals(approvalState);
  };

  public query ({ caller }) func getUserRole() : async AccessControl.UserRole {
    getEffectiveRole(caller);
  };

  public shared ({ caller }) func setFrontendCanisterId(canisterId : Text) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #admin) and not InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller)) {
      Runtime.trap("Unauthorized: Only admins can set frontend canister ID");
    };
    frontendCanisterId := canisterId;
  };

  public shared ({ caller }) func setBackendCanisterId(canisterId : Text) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #admin) and not InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller)) {
      Runtime.trap("Unauthorized: Only admins can set backend canister ID");
    };
    backendCanisterId := canisterId;
  };

  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can view profiles");
    };
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };

    let trimmedName = profile.name.trim(#text " ");
    if (trimmedName == "") {
      Runtime.trap("Username cannot be empty");
    };

    for ((principal, existingProfile) in userProfiles.entries()) {
      if (principal != caller and existingProfile.name == profile.name) {
        Runtime.trap("Username already taken");
      };
    };

    userProfiles.add(caller, profile);
  };

  public query ({ caller }) func isUsernameUnique(username : Text) : async Bool {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can check username availability");
    };

    let trimmedName = username.trim(#text " ");
    if (trimmedName == "") { return false };

    for ((_, profile) in userProfiles.entries()) {
      if (profile.name == username) { return false };
    };
    true;
  };

  public query ({ caller }) func getStorageStats() : async StorageStats {
    if (not AccessControl.hasPermission(accessControlState, caller, #admin) and not InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller)) {
      Runtime.trap("Unauthorized: Only admins can view storage statistics");
    };

    let totalSize = files.values().foldLeft(0, func(acc, file) { acc + file.size });

    // Count encrypted files from the dedicated tracking map
    let encryptedCount = encryptedFiles.size();

    {
      totalStorageBytes = totalSize;
      totalFolders = folders.size();
      totalFiles = files.size();
      totalEncryptedFiles = encryptedCount;
      backendCanisterId;
      frontendCanisterId;
      appVersion;
    };
  };

  public query ({ caller }) func getMembers() : async [AdminInfo] {
    if (not AccessControl.hasPermission(accessControlState, caller, #admin) and not InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller)) {
      Runtime.trap("Unauthorized: Only admins can view members");
    };

    let result = List.empty<AdminInfo>();
    let seenPrincipals = Map.empty<Principal, Bool>();

    // First, add the current admin if exists
    switch (adminPrincipal.value) {
      case (?adminP) {
        let profile = userProfiles.get(adminP);
        let username = switch (profile) {
          case (?p) { p.name };
          case (null) { "Admin" };
        };
        result.add({
          principal = adminP;
          username;
          role = #admin;
        });
        seenPrincipals.add(adminP, true);
      };
      case (null) {};
    };

    // Get all approved users from the approval list
    let approvals = UserApproval.listApprovals(approvalState);
    for (approval in approvals.values()) {
      if (approval.status == #approved) {
        let userPrincipal = approval.principal;
        // Skip if already added (e.g., the first admin)
        switch (seenPrincipals.get(userPrincipal)) {
          case (?_) { /* already added */ };
          case (null) {
            let profile = userProfiles.get(userPrincipal);
            let username = switch (profile) {
              case (?p) { p.name };
              case (null) { "(No username)" };
            };
            let role = AccessControl.getUserRole(accessControlState, userPrincipal);
            result.add({
              principal = userPrincipal;
              username;
              role;
            });
            seenPrincipals.add(userPrincipal, true);
          };
        };
      };
    };
    let membersArray = result.toArray();
    let arraySize = membersArray.size();

    if (arraySize > 1) {
      var sortedArray = membersArray.toVarArray<AdminInfo>();

      var i = arraySize;
      while (i > 0) {
        var j = 0;
        while (j + 1 < i) {
          let a = sortedArray[j];
          let b = sortedArray[j + 1];
          if (shouldSwap(a, b)) {
            let temp = a;
            sortedArray[j] := sortedArray[j + 1];
            sortedArray[j + 1] := temp;
          };
          j += 1;
        };
        i -= 1;
      };

      sortedArray.toArray();
    } else {
      membersArray;
    };
  };

  func shouldSwap(a : AdminInfo, b : AdminInfo) : Bool {
    switch (a.role, b.role) {
      case (#admin, #user) { false };
      case (#user, #admin) { true };
      case (_, _) { false };
    };
  };

  public shared ({ caller }) func removeMember(principal : Principal) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #admin) and not InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller)) {
      Runtime.trap("Unauthorized: Only admins can remove members");
    };

    // Prevent self-deletion
    if (caller == principal) {
      Runtime.trap("Cannot remove yourself");
    };

    // Protect the current admin from deletion
    switch (adminPrincipal.value) {
      case (?adminP) {
        if (principal == adminP) {
          Runtime.trap("Cannot remove the current admin");
        };
      };
      case (null) {};
    };

    // Fully reset member-specific identity state
    userProfiles.remove(principal);
    UserApproval.setApproval(approvalState, principal, #pending);
    AccessControl.assignRole(accessControlState, caller, principal, #guest);
  };

  // API Key Management
  public shared ({ caller }) func generateApiKey(description : Text) : async Text {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only approved users can generate API keys");
    };

    let keyId = "key_" # nextApiKeyId.toText();
    nextApiKeyId += 1;

    let token = await generateToken();
    let now = Time.now();

    let key : ApiKey = {
      id = keyId;
      token;
      description;
      ownerId = caller;
      createdAt = now;
    };

    apiKeys.add(keyId, key);
    token;
  };

  public shared ({ caller }) func deleteApiKey(id : Text) : async Bool {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only approved users can delete API keys");
    };

    switch (apiKeys.get(id)) {
      case (null) { false };
      case (?key) {
        // Only owner or admin can delete
        if (key.ownerId != caller and not AccessControl.isAdmin(accessControlState, caller)) {
          Runtime.trap("Unauthorized: Can only delete your own API keys");
        };
        apiKeys.remove(id);
        true;
      };
    };
  };

  public query ({ caller }) func listApiKeys() : async [ApiKey] {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only approved users can list API keys");
    };

    let result = List.empty<ApiKey>();
    for ((_, key) in apiKeys.entries()) {
      // Admin sees all keys; users see only their own
      if (AccessControl.isAdmin(accessControlState, caller) or key.ownerId == caller) {
        result.add(key);
      };
    };
    result.toArray();
  };

  public shared ({ caller }) func addFile(id : Text, name : Text, size : Nat, parentId : ?Text, blob : Storage.ExternalBlob, isEncrypted : Bool) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only admins and approved users can add files");
    };

    let now = Time.now();
    let metadata : FileMetadata = {
      id;
      name;
      size;
      blob;
      parentId;
      ownerId = caller;
      createdAt = now;
      updatedAt = now;
    };
    files.add(id, metadata);
    if (isEncrypted) { encryptedFiles.add(id, true) };
  };

  public query ({ caller }) func getFiles() : async [FileMetadata] {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can view files");
    };
    if (callerIsAdmin(caller)) {
      files.values().toArray();
    } else {
      files.values().toArray().filter(func(file) { file.ownerId == caller });
    };
  };

  public query ({ caller }) func getFile(id : Text) : async ?FileMetadata {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can view files");
    };
    switch (files.get(id)) {
      case (null) { null };
      case (?file) {
        if (file.ownerId == caller or callerIsAdmin(caller)) { ?file } else { null };
      };
    };
  };

  public shared ({ caller }) func deleteFile(id : Text) : async Bool {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can delete files");
    };

    switch (files.get(id)) {
      case (null) { false };
      case (?file) {
        if (file.ownerId != caller and not callerIsAdmin(caller)) {
          Runtime.trap("Unauthorized");
        };
        files.remove(id);
        encryptedFiles.remove(id);
        true;
      };
    };
  };

  func recursiveFolderSearch(
    searchTerm : Text,
    currentFolderId : ?Text,
    folderResults : List.List<FolderMetadata>,
    fileResults : List.List<FileMetadata>,
    owner : Principal,
  ) : () {
    let lowercaseTerm = textFoldASCII(searchTerm);
    for ((_, file) in files.entries()) {
      if (file.ownerId == owner and file.parentId == currentFolderId and containsFoldedTerm(file.name, lowercaseTerm)) {
        fileResults.add(file);
      };
    };
    for ((_, folder) in folders.entries()) {
      if (folder.ownerId == owner and folder.parentId == currentFolderId and containsFoldedTerm(folder.name, lowercaseTerm)) {
        folderResults.add(folder);
      };
    };
    for ((_, subfolder) in folders.entries()) {
      if (subfolder.ownerId == owner and subfolder.parentId == currentFolderId) {
        recursiveFolderSearch(searchTerm, ?subfolder.id, folderResults, fileResults, owner);
      };
    };
  };

  func containsFoldedTerm(text : Text, term : Text) : Bool {
    textFoldASCII(text).contains(#text term);
  };

  func textFoldASCII(input : Text) : Text {
    input.map(
      func(c) {
        switch (c) {
          case ('Á') { 'a' };
          case ('À') { 'a' };
          case ('Â') { 'a' };
          case ('Ä') { 'a' };
          case ('É') { 'e' };
          case ('È') { 'e' };
          case ('Ê') { 'e' };
          case ('Ë') { 'e' };
          case ('Í') { 'i' };
          case ('Ì') { 'i' };
          case ('Î') { 'i' };
          case ('Ï') { 'i' };
          case ('Ó') { 'o' };
          case ('Ò') { 'o' };
          case ('Ô') { 'o' };
          case ('Ö') { 'o' };
          case ('Ú') { 'u' };
          case ('Ù') { 'u' };
          case ('Û') { 'u' };
          case ('Ü') { 'u' };
          case ('Ç') { 'c' };
          case ('á') { 'a' };
          case ('à') { 'a' };
          case ('â') { 'a' };
          case ('ä') { 'a' };
          case ('é') { 'e' };
          case ('è') { 'e' };
          case ('ê') { 'e' };
          case ('ë') { 'e' };
          case ('í') { 'i' };
          case ('ì') { 'i' };
          case ('î') { 'i' };
          case ('ï') { 'i' };
          case ('ó') { 'o' };
          case ('ò') { 'o' };
          case ('ô') { 'o' };
          case ('ö') { 'o' };
          case ('ú') { 'u' };
          case ('ù') { 'u' };
          case ('û') { 'u' };
          case ('ü') { 'u' };
          case ('ç') { 'c' };
          case (_other) { c };
        };
      }
    );
  };

  public query ({ caller }) func searchFoldersInSubtree(searchTerm : Text, startFolderId : ?Text) : async FolderSearchResults {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can search folders");
    };

    let folderResults = List.empty<FolderMetadata>();
    let fileResults = List.empty<FileMetadata>();
    if (callerIsAdmin(caller)) {
      // Admin: search across all owners — branch to skip the owner filter
      recursiveFolderSearchAll(searchTerm, startFolderId, folderResults, fileResults);
    } else {
      recursiveFolderSearch(searchTerm, startFolderId, folderResults, fileResults, caller);
    };
    {
      folders = folderResults.toArray();
      files = fileResults.toArray();
    };
  };

  // Admin variant of recursiveFolderSearch — collects results across all owners.
  func recursiveFolderSearchAll(
    searchTerm : Text,
    currentFolderId : ?Text,
    folderResults : List.List<FolderMetadata>,
    fileResults : List.List<FileMetadata>,
  ) : () {
    let lowercaseTerm = textFoldASCII(searchTerm);
    for ((_, file) in files.entries()) {
      if (file.parentId == currentFolderId and containsFoldedTerm(file.name, lowercaseTerm)) {
        fileResults.add(file);
      };
    };
    for ((_, folder) in folders.entries()) {
      if (folder.parentId == currentFolderId and containsFoldedTerm(folder.name, lowercaseTerm)) {
        folderResults.add(folder);
      };
    };
    for ((_, subfolder) in folders.entries()) {
      if (subfolder.parentId == currentFolderId) {
        recursiveFolderSearchAll(searchTerm, ?subfolder.id, folderResults, fileResults);
      };
    };
  };

  public query ({ caller }) func searchFiles(searchTerm : Text) : async [FileMetadata] {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can search files");
    };

    let lowercaseTerm = searchTerm.toLower();
    let allMatches = files.values().toArray().filter(
      func(file) {
        file.name.toLower().contains(#text lowercaseTerm);
      }
    );
    if (callerIsAdmin(caller)) {
      allMatches;
    } else {
      allMatches.filter(func(file) { file.ownerId == caller });
    };
  };

  public query ({ caller }) func searchSubtree(searchTerm : Text, startFolderId : ?Text) : async [FileSystemItem] {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can search folders");
    };

    let lowercaseTerm = searchTerm.toLower();
    let matches = List.empty<FileSystemItem>();
    let admin = callerIsAdmin(caller);

    func searchFolder(folderId : ?Text) {
      for ((_, folder) in folders.entries()) {
        if (admin or folder.ownerId == caller) {
          switch (folder.parentId) {
            case (?parent) {
              if (?parent == folderId) {
                if (folder.name.toLower().contains(#text lowercaseTerm)) {
                  matches.add(#folder(folder));
                };
                // Always search subfolders recursively if parent matches
                searchFolder(?folder.id);
              };
            };
            case (null) {
              if (folderId == null and folder.name.toLower().contains(#text lowercaseTerm)) {
                matches.add(#folder(folder));
                searchFolder(?folder.id);
              };
            };
          };
        };
      };

      for ((_, file) in files.entries()) {
        if (admin or file.ownerId == caller) {
          switch (file.parentId) {
            case (?parent) {
              if (?parent == folderId and file.name.toLower().contains(#text lowercaseTerm)) {
                matches.add(#file(file));
              };
            };
            case (null) {
              if (folderId == null and file.name.toLower().contains(#text lowercaseTerm)) {
                matches.add(#file(file));
              };
            };
          };
        };
      };
    };

    searchFolder(startFolderId);
    matches.toArray();
  };

  public shared ({ caller }) func createFolder(name : Text, parentId : ?Text) : async Text {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can create folders");
    };

    let folderId = nextFolderId.toText();
    nextFolderId += 1;

    let now = Time.now();
    let folder : FolderMetadata = {
      id = folderId;
      name;
      parentId;
      ownerId = caller;
      createdAt = now;
      updatedAt = now;
    };

    folders.add(folderId, folder);
    folderId;
  };

  public shared ({ caller }) func deleteFolder(id : Text) : async Bool {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can delete folders");
    };

    // Fetch the folder first to determine its owner for the authorization check
    // and to pass the owner into recursiveDelete so only that owner's subtree is deleted.
    let folder = switch (folders.get(id)) {
      case (null) { return false };
      case (?f) { f };
    };
    if (folder.ownerId != caller and not callerIsAdmin(caller)) {
      Runtime.trap("Unauthorized");
    };
    recursiveDelete(id, folder.ownerId);
    true;
  };

  func recursiveDelete(folderId : Text, owner : Principal) {
    // Snapshot child folder IDs before modifying to avoid mutation-during-iteration
    let childFolderIds = List.empty<Text>();
    for ((_, folder) in folders.entries()) {
      if (folder.parentId == ?folderId and folder.ownerId == owner) {
        childFolderIds.add(folder.id);
      };
    };
    for (childId in childFolderIds.toArray().vals()) {
      recursiveDelete(childId, owner);
    };

    // Snapshot file IDs to remove before deleting
    let fileIdsToRemove = List.empty<Text>();
    for ((fileId, file) in files.entries()) {
      switch (file.parentId) {
        case (?parentId) {
          if (parentId == folderId and file.ownerId == owner) {
            fileIdsToRemove.add(fileId);
          };
        };
        case (null) {};
      };
    };
    for (fileId in fileIdsToRemove.toArray().vals()) {
      files.remove(fileId);
      encryptedFiles.remove(fileId);
    };
    folders.remove(folderId);
  };

  public query ({ caller }) func getFolderContents(folderId : ?Text) : async [FileSystemItem] {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can view folder contents");
    };

    let items = List.empty<FileSystemItem>();
    let admin = callerIsAdmin(caller);

    for ((_, folder) in folders.entries()) {
      if (folder.parentId == folderId and (admin or folder.ownerId == caller)) {
        items.add(#folder(folder));
      };
    };

    for ((_, file) in files.entries()) {
      if (file.parentId == folderId and (admin or file.ownerId == caller)) {
        items.add(#file(file));
      };
    };

    items.toArray();
  };

  public shared ({ caller }) func moveItem(itemId : Text, newParentId : ?Text, isFolder : Bool) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can move items");
    };

    let now = Time.now();
    if (isFolder) {
      switch (folders.get(itemId)) {
        case (null) { Runtime.trap("Folder not found") };
        case (?folder) {
          if (folder.ownerId != caller and not callerIsAdmin(caller)) {
            Runtime.trap("Unauthorized");
          };
          let updatedFolder : FolderMetadata = {
            folder with parentId = newParentId;
            updatedAt = now;
          };
          folders.add(itemId, updatedFolder);
          updateParentTimestamps(newParentId, now, false);
        };
      };
    } else {
      switch (files.get(itemId)) {
        case (null) { Runtime.trap("File not found") };
        case (?file) {
          if (file.ownerId != caller and not callerIsAdmin(caller)) {
            Runtime.trap("Unauthorized");
          };
          let updatedFile : FileMetadata = {
            file with parentId = newParentId;
            updatedAt = now;
          };
          updateParentTimestamps(newParentId, now, false);
          files.add(itemId, updatedFile);
        };
      };
    };
  };

  public shared ({ caller }) func moveItems(moves : [FileMove]) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can move items");
    };

    let now = Time.now();
    for (move in moves.values()) {
      if (move.isFolder) {
        switch (folders.get(move.id)) {
          case (null) { Runtime.trap("Folder not found") };
          case (?folder) {
            if (folder.ownerId != caller and not callerIsAdmin(caller)) {
              Runtime.trap("Unauthorized");
            };
            let updatedFolder : FolderMetadata = {
              folder with parentId = move.newParentId;
              updatedAt = now;
            };
            folders.add(move.id, updatedFolder);
            updateParentTimestamps(move.newParentId, now, false);
          };
        };
      } else {
        switch (files.get(move.id)) {
          case (null) { Runtime.trap("File not found") };
          case (?file) {
            if (file.ownerId != caller and not callerIsAdmin(caller)) {
              Runtime.trap("Unauthorized");
            };
            updateParentTimestamps(move.newParentId, now, false);
            let updatedFile : FileMetadata = {
              file with parentId = move.newParentId;
              updatedAt = now;
            };
            files.add(move.id, updatedFile);
          };
        };
      };
    };
  };

  func updateParentTimestamps(parentId : ?Text, timestamp : Time.Time, updateAllAncestors : Bool) {
    switch (parentId) {
      case (?folderId) {
        switch (folders.get(folderId)) {
          case (?folder) {
            let updatedFolder : FolderMetadata = {
              folder with updatedAt = timestamp;
            };
            folders.add(folderId, updatedFolder);
            if (updateAllAncestors) {
              updateParentTimestamps(folder.parentId, timestamp, true);
            };
          };
          case (null) {};
        };
      };
      case (null) {};
    };
  };

  public query ({ caller }) func getFolder(id : Text) : async ?FolderMetadata {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can view folders");
    };
    switch (folders.get(id)) {
      case (null) { null };
      case (?folder) {
        if (folder.ownerId == caller or callerIsAdmin(caller)) { ?folder } else { null };
      };
    };
  };

  public query ({ caller }) func getAllFolders() : async [FolderMetadata] {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only existing users can view folders");
    };
    if (callerIsAdmin(caller)) {
      folders.values().toArray();
    } else {
      folders.values().toArray().filter(func(folder) { folder.ownerId == caller });
    };
  };

  func getEffectiveRole(principal : Principal) : AccessControl.UserRole {
    let actualRole = AccessControl.getUserRole(accessControlState, principal);
    if (actualRole == #admin or UserApproval.isApproved(approvalState, principal)) {
      actualRole;
    } else {
      #guest;
    };
  };
};
