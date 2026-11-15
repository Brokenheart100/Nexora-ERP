namespace Nexora.Finance.Domain;

public sealed class BankMovement
{
    private BankMovement() { }
    public BankMovement(BankAccount bank, TradeDocument document, Guid journalId, decimal amount, Guid? reversesId = null)
        : this(bank, document.Id, document.Terms.On, journalId, amount, reversesId) { }

    public BankMovement(BankAccount bank, Guid documentId, DateOnly on, Guid journalId, decimal amount, Guid? reversesId = null)
    {
        Id = Guid.CreateVersion7();
        TenantId = bank.TenantId;
        WorkspaceId = bank.WorkspaceId;
        BankId = bank.Id;
        DocumentId = documentId;
        JournalId = journalId;
        On = on;
        Amount = amount;
        ReversesId = reversesId;
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid BankId { get; private set; }
    public Guid DocumentId { get; private set; }
    public Guid JournalId { get; private set; }
    public DateOnly On { get; private set; }
    public decimal Amount { get; private set; }
    public decimal Matched { get; private set; }
    public bool Voided { get; private set; }
    public Guid? ReversesId { get; private set; }
    public void Match(decimal amount)
    {
        if (Voided || amount <= 0 || amount > Math.Abs(Amount) - Matched) throw new LedgerRuleException("Bank movement match exceeds the remaining amount.");
        Matched += amount;
    }
    public void Unmatch(decimal amount)
    {
        if (Voided || amount <= 0 || amount > Matched) throw new LedgerRuleException("Invalid bank match release.");
        Matched -= amount;
    }
    public void Void()
    {
        if (Voided || Matched != 0) throw new LedgerRuleException("Remove statement matches before voiding a transaction.");
        Voided = true;
    }
}
