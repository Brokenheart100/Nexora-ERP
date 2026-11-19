namespace Nexora.Finance.Domain;

public sealed class FiscalPeriod
{
    private FiscalPeriod() { }
    public FiscalPeriod(AccountingBook book, DateOnly month)
    {
        if (month.Day != 1 || month < MonthOf(book.StartsOn) || month.Year > 9998)
            throw new ArgumentException("Use a valid accounting month on or after the book start.");
        TenantId = book.TenantId;
        WorkspaceId = book.WorkspaceId;
        Month = month;
    }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public DateOnly Month { get; private set; }
    public PeriodState State { get; private set; } = PeriodState.Open;
    public long Version { get; private set; } = 1;
    public long? ClosingWatermark { get; private set; }
    public static DateOnly MonthOf(DateOnly date) => new(date.Year, date.Month, 1);

    public void BeginClosing(long watermark)
    {
        if (State != PeriodState.Open) throw new LedgerRuleException("Only an open period can enter closing.");
        State = PeriodState.Closing;
        ClosingWatermark = watermark;
        Version++;
    }
    public void Close(long watermark, bool pendingJournals)
    {
        if (State != PeriodState.Closing || ClosingWatermark != watermark || pendingJournals)
            throw new LedgerRuleException("Closing requires an unchanged posting watermark and no pending journals.");
        State = PeriodState.Closed;
        Version++;
    }
    public void Reopen()
    {
        if (State == PeriodState.Open) throw new LedgerRuleException("The period is already open.");
        State = PeriodState.Open;
        ClosingWatermark = null;
        Version++;
    }
    public void RequireOpen()
    {
        if (State != PeriodState.Open) throw new LedgerRuleException("The accounting period is not open.", "finance.period_not_open");
    }
}
