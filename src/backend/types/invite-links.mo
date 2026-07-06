import Principal "mo:core/Principal";
import Time "mo:core/Time";

module {
  public type InviteCode = {
    code : Text;
    createdAt : Time.Time;
    expiresAt : ?Time.Time;
    maxUses : ?Nat;
    usedCount : Nat;
    usedBy : [Principal];
    isActive : Bool;
    createdBy : Principal;
  };

  public type InviteResult = {
    #ok;
    #err : Text;
  };

  public type AccessCheckResult = {
    #Admin;
    #Approved;
    #NeedsInvite;
    #PendingApproval;
  };
};
