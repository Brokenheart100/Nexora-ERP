namespace Nexora.Finance.Domain;

public sealed class AccountingBook
{
    private AccountingBook() { }

    public AccountingBook(Guid workspaceId, Guid tenantId, bool isPersonal, Guid operationId, string baseCurrency,
        DateOnly startsOn, int fiscalYearStartMonth, string issuer, string subject, DateTimeOffset now)
    {
        if (workspaceId == Guid.Empty || tenantId == Guid.Empty || operationId == Guid.Empty)
            throw new ArgumentException("Workspace and operation identifiers are required.");
        if (baseCurrency is not ("CNY" or "USD" or "EUR" or "JPY"))
            throw new ArgumentException("Unsupported book currency.");
        if (startsOn.Year is < 1900 or > 9998 || fiscalYearStartMonth is < 1 or > 12)
            throw new ArgumentException("Invalid accounting start or fiscal year month.");
        WorkspaceId = workspaceId;
        TenantId = tenantId;
        IsPersonal = isPersonal;
        OperationId = operationId;
        BaseCurrency = baseCurrency;
        StartsOn = startsOn;
        FiscalYearStartMonth = fiscalYearStartMonth;
        InitializedByIssuer = issuer;
        InitializedBySubject = subject;
        InitializedAtUtc = now.ToUniversalTime();
    }

    public Guid WorkspaceId { get; private set; }
    public Guid TenantId { get; private set; }
    public bool IsPersonal { get; private set; }
    public Guid OperationId { get; private set; }
    public string BaseCurrency { get; private set; } = "";
    public DateOnly StartsOn { get; private set; }
    public int FiscalYearStartMonth { get; private set; }
    public string InitializedByIssuer { get; private set; } = "";
    public string InitializedBySubject { get; private set; } = "";
    public DateTimeOffset InitializedAtUtc { get; private set; }
    public long ChartRevision { get; private set; } = 1;
    public bool HasAccountingActivity { get; private set; }
    public long LastPostingNumber { get; private set; }
    public TaxCycle TaxCycle { get; private set; } = TaxCycle.Monthly;
    public TaxBasis TaxBasis { get; private set; }
    public long TaxCalendarVersion { get; private set; }
    public DateOnly? TaxLockedThrough { get; private set; }
    public string? InvoiceNumberPattern { get; private set; }
    public long InvoiceNumberStart { get; private set; } = 1;
    public long InvoiceNumberVersion { get; private set; }

    public void ConfigureInvoiceNumbers(string? pattern, long start)
    {
        var normalized = FiscalInvoiceNumber.Normalize(pattern, start);
        if (start < InvoiceNumberStart) throw new LedgerRuleException("The invoice starting number can only increase.");
        if (InvoiceNumberPattern == normalized && InvoiceNumberStart == start) return;
        InvoiceNumberPattern = normalized;
        InvoiceNumberStart = start;
        InvoiceNumberVersion++;
    }

    public void ChangeTaxCalendar(TaxCycle cycle, TaxBasis basis)
    {
        if (cycle is not (TaxCycle.Monthly or TaxCycle.Quarterly)) throw new ArgumentException("Invalid tax cycle.");
        if (basis is not (TaxBasis.Accrual or TaxBasis.Cash)) throw new ArgumentException("Invalid tax basis.");
        if (TaxCycle == cycle && TaxBasis == basis) return;
        TaxCycle = cycle;
        TaxBasis = basis;
        TaxCalendarVersion++;
    }

    public void LockForTax(DateOnly through)
    {
        if (TaxLockedThrough is null || through > TaxLockedThrough) TaxLockedThrough = through;
    }

    public bool IsTaxLocked(DateOnly date) => TaxLockedThrough is DateOnly through && date <= through;

    public void DemandTaxDateOpen(DateOnly date)
    {
        if (IsTaxLocked(date)) throw new LedgerRuleException("The posting date is locked by a tax filing.", "finance.tax_period_locked");
    }

    public void AdvanceChart() => ChartRevision++;
    public void RegisterAccountingActivity() => HasAccountingActivity = true;
    public long NextPostingNumber() => ++LastPostingNumber;
    public int MinorUnits => BaseCurrency == "JPY" ? 0 : 2;
    public string Template => IsPersonal ? "personal-starter-v1" : "trade-starter-v1";
}

public sealed class ChartAccount
{
    private ChartAccount() { }
    private ChartAccount(AccountingBook book, string code, string name, AccountCategory category)
    {
        Id = Guid.CreateVersion7();
        TenantId = book.TenantId;
        WorkspaceId = book.WorkspaceId;
        Code = code;
        Name = name;
        Category = category;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public string Code { get; private set; } = "";
    public string Name { get; private set; } = "";
    public AccountCategory Category { get; private set; }
    public Guid? ParentId { get; private set; }
    public AccountPurpose Purpose { get; private set; } = AccountPurpose.Posting;
    public bool IsArchived { get; private set; }
    public bool IsUsed { get; private set; }
    public long Version { get; private set; } = 1;

    public static ChartAccount Create(AccountingBook book, AccountDefinition definition, Guid id, Guid? parentId) =>
        new(book, definition.Code, definition.Name, definition.Category)
        {
            Id = id, ParentId = parentId, Purpose = definition.Purpose, IsArchived = definition.IsArchived
        };

    public void Apply(AccountDefinition definition, Guid? parentId)
    {
        if (definition.Code != Code || definition.Category != Category)
            throw new ArgumentException("An account's code and category are fixed.");
        if (IsUsed && definition.Purpose != Purpose)
            throw new ArgumentException("The purpose of a used account is fixed.");
        if (Name == definition.Name && ParentId == parentId && Purpose == definition.Purpose && IsArchived == definition.IsArchived) return;
        Name = definition.Name;
        ParentId = parentId;
        Purpose = definition.Purpose;
        IsArchived = definition.IsArchived;
        Version++;
    }

    public void MarkUsed() => IsUsed = true;

    public static IReadOnlyList<ChartAccount> StarterChart(AccountingBook book) =>
        book.IsPersonal
            ? [new(book, "1001", "现金及银行", AccountCategory.Asset),
                new(book, "2001", "个人负债", AccountCategory.Liability),
                new(book, "3001", "个人净资产", AccountCategory.Equity),
                new(book, "4001", "个人收入", AccountCategory.Income),
                new(book, "5001", "个人支出", AccountCategory.Expense)]
            : [new(book, "1001", "库存现金", AccountCategory.Asset),
                new(book, "1002", "银行存款", AccountCategory.Asset),
                new(book, "1405", "库存商品", AccountCategory.Asset),
                new(book, "2001", "其他负债", AccountCategory.Liability),
                new(book, "3001", "期初权益", AccountCategory.Equity),
                new(book, "4001", "商品收入", AccountCategory.Income),
                new(book, "5001", "经营费用", AccountCategory.Expense)];
}
