namespace Nexora.Finance.Domain;

public sealed class InvoiceShare
{
    private InvoiceShare() { }

    public InvoiceShare(CustomerDocument invoice, string tokenHash, DateTimeOffset expiresAtUtc)
    {
        if (invoice.State != CustomerDocumentState.Posted || invoice.Terms.Kind != CustomerDocumentKind.Invoice || invoice.JournalId is null)
            throw new LedgerRuleException("Only a posted invoice can be shared.");
        Id = Guid.CreateVersion7();
        TenantId = invoice.TenantId;
        WorkspaceId = invoice.WorkspaceId;
        InvoiceId = invoice.Id;
        JournalId = invoice.JournalId.Value;
        TokenHash = tokenHash;
        ExpiresAtUtc = expiresAtUtc;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid InvoiceId { get; private set; }
    public Guid JournalId { get; private set; }
    public string TokenHash { get; private set; } = "";
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public DateTimeOffset? RevokedAtUtc { get; private set; }
    public bool Allows(DateTimeOffset now) => RevokedAtUtc is null && ExpiresAtUtc > now;
    public void Revoke(DateTimeOffset now) => RevokedAtUtc ??= now;
}
