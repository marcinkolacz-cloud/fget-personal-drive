import Principal "mo:core/Principal";
import Map "mo:core/Map";

import Types "../types/invite-links";
import InviteLinksLib "../lib/invite-links";
import Runtime "mo:core/Runtime";
import AccessControl "mo:caffeineai-authorization/access-control";
import UserApproval "mo:caffeineai-user-approval/approval";

mixin (
  adminPrincipal : { var value : ?Principal },
  inviteCodes : Map.Map<Text, Types.InviteCode>,
  accessControlState : { var adminAssigned : Bool; userRoles : Map.Map<Principal, AccessControl.UserRole> },
  approvalState : UserApproval.UserApprovalState,
) {
  public shared ({ caller }) func generateInviteCode(
    expiresAt : ?Int,
    maxUses : ?Nat,
  ) : async Text {
    if (not InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller)) {
      Runtime.trap("Unauthorized: Only admins can generate invite codes");
    };
    InviteLinksLib.generateInviteCode(inviteCodes, caller, expiresAt, maxUses);
  };

  public query func validateInviteCode(code : Text) : async Bool {
    InviteLinksLib.validateInviteCode(inviteCodes, code);
  };

  public shared ({ caller }) func redeemInviteCode(code : Text) : async Types.InviteResult {
    InviteLinksLib.redeemInviteCode(inviteCodes, caller, code);
  };

  public query ({ caller }) func listInviteCodes() : async [Types.InviteCode] {
    if (not InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller)) {
      Runtime.trap("Unauthorized: Only admins can list invite codes");
    };
    InviteLinksLib.listInviteCodes(inviteCodes);
  };

  public shared ({ caller }) func revokeInviteCode(code : Text) : async Types.InviteResult {
    if (not InviteLinksLib.callerIsAdmin(adminPrincipal.value, caller)) {
      Runtime.trap("Unauthorized: Only admins can revoke invite codes");
    };
    InviteLinksLib.revokeInviteCode(inviteCodes, code);
  };

  public query ({ caller }) func checkAccess() : async Types.AccessCheckResult {
    let isUserApproved = func(p : Principal) : Bool {
      AccessControl.hasPermission(accessControlState, p, #user)
    };
    let isPendingApproval = func(p : Principal) : Bool {
      switch (UserApproval.listApprovals(approvalState).find(func(info) { Principal.equal(info.principal, p) and info.status == #pending })) {
        case (?_) { true };
        case (null) { false };
      }
    };
    InviteLinksLib.checkAccess(adminPrincipal.value, inviteCodes, isUserApproved, isPendingApproval, caller);
  };

  public shared ({ caller }) func setAdmin(principal : Principal) : async Types.InviteResult {
    // Sync accessControlState: remove old admin role before changing admin
    switch (adminPrincipal.value) {
      case (?currentAdmin) {
        if (Principal.equal(caller, currentAdmin)) {
          AccessControl.assignRole(accessControlState, caller, currentAdmin, #guest);
        };
      };
      case (null) {};
    };
    let result = InviteLinksLib.setAdmin(adminPrincipal, caller, principal);
    switch (result) {
      case (#ok) {
        AccessControl.assignRole(accessControlState, caller, principal, #admin);
      };
      case (_) {};
    };
    result;
  };

  public query func getAdmin() : async ?Principal {
    InviteLinksLib.getAdmin(adminPrincipal.value);
  };

};
