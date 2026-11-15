namespace Nexora.Finance.Domain;

public sealed class BankAccount
{
    private BankAccount() { }
    public BankAccount(AccountingBook book, string code, string name, string kind, Guid accountId)
    {
        if (code.Length is < 1 or > 40 || name.Length is < 1 or > 160 || kind is not ("bank" or "cash"))
            throw new ArgumentException("Invalid bank account details.");
        Id = Guid.CreateVersion7();
        TenantId = book.TenantId;
        WorkspaceId = book.WorkspaceId;
        Code = code;
        Name = name;
        Kind = kind;
        AccountId = accountId;
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid AccountId { get; private set; }
    public string Code { get; private set; } = "";
    public string Name { get; private set; } = "";
    public string Kind { get; private set; } = "";
    public bool IsDefault { get; private set; }
    public long Version { get; private set; } = 1;
    public decimal Balance { get; private set; }
    public long Entries { get; private set; }
    public void SetDefault(bool value)
    {
        if (IsDefault == value) return;
        IsDefault = value;
        Version++;
    }
    public void Apply(decimal amount)
    {
        if (amount == 0) throw new ArgumentException("A bank movement requires a nonzero amount.");
        Balance += amount;
        Entries++;
        Version++;
    }
}
