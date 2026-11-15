namespace Nexora.Organization.Domain;

public sealed class WorkspaceInvitation
{
    public Guid Id { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid OperationId { get; private set; }
    public string Issuer { get; private set; } = "";
    public string Email { get; private set; } = "";
    public string Role { get; private set; } = "";
    public string[]? BusinessRoles { get; private set; }
    public Guid? ApproverMemberId { get; private set; }
    public string TokenHash { get; private set; } = "";
    public string InviterIssuer { get; private set; } = "";
    public string InviterSubject { get; private set; } = "";
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public string State { get; private set; } = "Pending";
    public string? AcceptedSubject { get; private set; }
    internal bool IsOutstanding => State is "Pending" or "PendingApproval";
    private WorkspaceInvitation() { }
    internal static WorkspaceInvitation Issue(Guid workspaceId, Guid operationId, IdentityReference inviter,
        VerifiedEmail email, string role, string hash, DateTimeOffset now, string[] businessRoles) => new()
    {
        Id = Guid.CreateVersion7(), WorkspaceId = workspaceId, OperationId = operationId, Issuer = inviter.Issuer,
        Email = email.Value, Role = role, TokenHash = businessRoles.Length == 0 ? hash : "",
        BusinessRoles = businessRoles.Length == 0 ? null : businessRoles,
        State = businessRoles.Length == 0 ? "Pending" : "PendingApproval",
        InviterIssuer = inviter.Issuer, InviterSubject = inviter.Subject,
        CreatedAtUtc = now.ToUniversalTime(), ExpiresAtUtc = now.ToUniversalTime().AddHours(24)
    };
    internal void Approve(Guid approverMemberId, string tokenHash, DateTimeOffset now)
    {
        ApproverMemberId = approverMemberId;
        TokenHash = tokenHash;
        State = "Pending";
        ExpiresAtUtc = now.ToUniversalTime().AddHours(24);
    }
    internal void Accept(string subject) { State = "Accepted"; AcceptedSubject = subject; }
    internal void Revoke() => State = "Revoked";
}
