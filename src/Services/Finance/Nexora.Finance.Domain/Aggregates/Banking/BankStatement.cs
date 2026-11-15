namespace Nexora.Finance.Domain;

public sealed class StatementLine
{
    private StatementLine() { }
    public StatementLine(Guid tenantId, Guid workspaceId, Guid bankId, Guid batchId, StatementEntry row)
    {
        Id = Guid.CreateVersion7();
        TenantId = tenantId;
        WorkspaceId = workspaceId;
        BankId = bankId;
        BatchId = batchId;
        Row = row.Row;
        ExternalId = row.ExternalId;
        On = row.On;
        Amount = row.Amount;
        Description = row.Description;
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid BankId { get; private set; }
    public Guid BatchId { get; private set; }
    public int Row { get; private set; }
    public string ExternalId { get; private set; } = "";
    public DateOnly On { get; private set; }
    public decimal Amount { get; private set; }
    public string Description { get; private set; } = "";
    public decimal Matched { get; private set; }
    public long Version { get; private set; } = 1;
    public bool Excluded { get; private set; }
    public void Match(decimal amount)
    {
        if (Excluded || amount <= 0 || amount > Math.Abs(Amount) - Matched)
            throw new LedgerRuleException("Statement allocation exceeds the remaining amount.");
        Matched += amount;
        Version++;
    }
    public void Unmatch(decimal amount)
    {
        if (amount <= 0 || amount > Matched) throw new LedgerRuleException("Invalid statement allocation release.");
        Matched -= amount;
        Version++;
    }
    public void Exclude(bool value)
    {
        if (Matched != 0) throw new LedgerRuleException("Release existing statement allocations first.");
        if (Excluded == value) return;
        Excluded = value;
        Version++;
    }
    public bool Matches(StatementEntry row) => ExternalId == row.ExternalId && On == row.On && Amount == row.Amount && Description == row.Description;
}

public sealed class StatementMatch
{
    private StatementMatch() { }
    public StatementMatch(StatementLine line, BankMovement movement, Guid referenceId, decimal amount)
    {
        Id = Guid.CreateVersion7();
        TenantId = line.TenantId;
        WorkspaceId = line.WorkspaceId;
        StatementLineId = line.Id;
        MovementId = movement.Id;
        ReferenceId = referenceId;
        Amount = amount;
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid StatementLineId { get; private set; }
    public Guid MovementId { get; private set; }
    public Guid ReferenceId { get; private set; }
    public decimal Amount { get; private set; }
    public bool Reversed { get; private set; }
    public void Reverse()
    {
        if (Reversed) throw new LedgerRuleException("This match was already reversed.");
        Reversed = true;
    }
}
