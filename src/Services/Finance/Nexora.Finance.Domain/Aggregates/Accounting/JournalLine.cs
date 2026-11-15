namespace Nexora.Finance.Domain;

public sealed class JournalLine
{
    private JournalLine() { }
    internal JournalLine(Journal journal, int ordinal, JournalLineSnapshot line)
    {
        Id = Guid.CreateVersion7();
        TenantId = journal.TenantId;
        WorkspaceId = journal.WorkspaceId;
        JournalId = journal.Id;
        Ordinal = ordinal;
        AccountId = line.AccountId;
        Code = line.Code;
        Name = line.Name;
        Debit = line.Debit;
        Credit = line.Credit;
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid JournalId { get; private set; }
    public int Ordinal { get; private set; }
    public Guid AccountId { get; private set; }
    public string Code { get; private set; } = "";
    public string Name { get; private set; } = "";
    public decimal Debit { get; private set; }
    public decimal Credit { get; private set; }
}
