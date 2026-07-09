import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Map "mo:core/Map";
import Types "../types/invite-links";


import Int "mo:core/Int";
import Text "mo:core/Text";
import Array "mo:core/Array";
import Char "mo:core/Char";
import Random "mo:core/Random";

module {
  public type InviteCode = Types.InviteCode;
  public type InviteResult = Types.InviteResult;
  public type AccessCheckResult = Types.AccessCheckResult;

  public func generateInviteCode(
    inviteCodes : Map.Map<Text, InviteCode>,
    caller : Principal,
    expiresAt : ?Time.Time,
    maxUses : ?Nat,
  ) : async Text {
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let charsArray = chars.chars().toArray();
    let charsLen = charsArray.size();

    var code = "";
    var i = 0;
    while (i < 8) {
      let idx = await Random.natRange(0, charsLen);
      code #= charsArray[idx].toText();
      i += 1;
    };

    let now = Time.now();
    let invite : InviteCode = {
      code;
      createdAt = now;
      expiresAt;
      maxUses;
      usedCount = 0;
      usedBy = [];
      isActive = true;
      createdBy = caller;
    };
    inviteCodes.add(code, invite);
    code;
  };

  public func validateInviteCode(
    inviteCodes : Map.Map<Text, InviteCode>,
    code : Text,
  ) : Bool {
    switch (inviteCodes.get(code)) {
      case (null) { false };
      case (?invite) {
        if (not invite.isActive) { return false };
        switch (invite.expiresAt) {
          case (?exp) {
            if (Time.now() > exp) { return false };
          };
          case (null) {};
        };
        switch (invite.maxUses) {
          case (?max) {
            if (invite.usedCount >= max) { return false };
          };
          case (null) {};
        };
        true;
      };
    };
  };

  public func redeemInviteCode(
    inviteCodes : Map.Map<Text, InviteCode>,
    caller : Principal,
    code : Text,
  ) : InviteResult {
    switch (inviteCodes.get(code)) {
      case (null) { #err("Invalid invite code") };
      case (?invite) {
        if (not invite.isActive) { return #err("Invite code is inactive") };
        switch (invite.expiresAt) {
          case (?exp) {
            if (Time.now() > exp) { return #err("Invite code has expired") };
          };
          case (null) {};
        };
        switch (invite.maxUses) {
          case (?max) {
            if (invite.usedCount >= max) { return #err("Invite code has reached maximum uses") };
          };
          case (null) {};
        };
        // Check if caller already used this code
        for (p in invite.usedBy.values()) {
          if (Principal.equal(p, caller)) {
            return #err("You have already used this invite code");
          };
        };
        let updatedUsedBy = invite.usedBy.concat([caller]);
        let updatedInvite : InviteCode = {
          invite with
          usedCount = invite.usedCount + 1;
          usedBy = updatedUsedBy;
        };
        inviteCodes.add(code, updatedInvite);
        #ok(());
      };
    };
  };

  public func listInviteCodes(
    inviteCodes : Map.Map<Text, InviteCode>,
  ) : [InviteCode] {
    inviteCodes.values().toArray();
  };

  public func revokeInviteCode(
    inviteCodes : Map.Map<Text, InviteCode>,
    code : Text,
  ) : InviteResult {
    switch (inviteCodes.get(code)) {
      case (null) { #err("Invite code not found") };
      case (?invite) {
        let updatedInvite : InviteCode = {
          invite with isActive = false;
        };
        inviteCodes.add(code, updatedInvite);
        #ok(());
      };
    };
  };

  public func checkAccess(
    adminPrincipal : ?Principal,
    inviteCodes : Map.Map<Text, InviteCode>,
    isUserApproved : (Principal) -> Bool,
    isPendingApproval : (Principal) -> Bool,
    caller : Principal,
  ) : AccessCheckResult {
    // If admin is explicitly set, only that principal is admin
    switch (adminPrincipal) {
      case (?admin) {
        if (Principal.equal(caller, admin)) { return #Admin };
      };
      case (null) {
        // No admin set: bootstrap mode. Until setAdmin is called,
        // no one is auto-approved — new principals get #NeedsInvite.
      };
    };

    // Check if caller has already redeemed an invite code
    for ((_, invite) in inviteCodes.entries()) {
      for (p in invite.usedBy.values()) {
        if (Principal.equal(p, caller)) {
          return #Approved;
        };
      };
    };

    // NOTE: isUserApproved() is intentionally NOT called here.
    // The authorization system auto-assigns #user role on first login,
    // which would bypass the invite code requirement for all new users.
    // The only ways to get #Approved are:
    //   1. Be the admin principal
    //   2. Have redeemed a valid invite code (checked above)
    //   3. Have been explicitly approved via admin approval flow (checked next)

    // Check if caller has a pending approval request
    if (isPendingApproval(caller)) {
      return #PendingApproval;
    };

    // New user without invite code or approval
    #NeedsInvite;
  };

  public func setAdmin(
    adminPrincipal : { var value : ?Principal },
    caller : Principal,
    principal : Principal,
  ) : InviteResult {
    switch (adminPrincipal.value) {
      case (null) {
        // Bootstrap: first caller to setAdmin becomes admin
        adminPrincipal.value := ?principal;
        #ok(())
      };
      case (?currentAdmin) {
        if (Principal.equal(caller, currentAdmin)) {
          adminPrincipal.value := ?principal;
          #ok(())
        } else {
          #err("Unauthorized: Only the current admin can set a new admin")
        }
      };
    }
  };

  public func getAdmin(
    adminPrincipal : ?Principal,
  ) : ?Principal {
    adminPrincipal;
  };

  public func callerIsAdmin(
    adminPrincipal : ?Principal,
    caller : Principal,
  ) : Bool {
    switch (adminPrincipal) {
      case (?admin) { Principal.equal(caller, admin) };
      case (null) { false };
    };
  };
};
