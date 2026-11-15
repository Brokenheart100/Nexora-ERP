namespace Nexora.Finance.Domain;

public sealed class InvoiceSchedule
{
    private InvoiceSchedule() { }

    public InvoiceSchedule(AccountingBook book, RecurringTerms terms, DateOnly firstOn, JournalActor maker)
    {
        Id = Guid.CreateVersion7();
        TenantId = book.TenantId;
        WorkspaceId = book.WorkspaceId;
        Revise(book, terms, firstOn, maker);
        Version = 1;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public RecurringTerms Terms { get; private set; } = null!;
    public DateOnly? NextOn { get; private set; }
    public DateOnly? LastOn { get; private set; }
    public bool Paused { get; private set; }
    public long Version { get; private set; }
    public string MakerIssuer { get; private set; } = "";
    public string MakerSubject { get; private set; } = "";
    public string? PendingReason { get; private set; }

    public void Revise(AccountingBook book, RecurringTerms terms, DateOnly nextOn, JournalActor maker)
    {
        if (nextOn < book.StartsOn || nextOn.Year > 9998 || nextOn <= LastOn || terms.EndsOn < nextOn
            || terms.IntervalMonths is < 1 or > 24 || terms.DueDays is < 0 or > 180
            || terms.Quantity is <= 0 or > 1_000_000 || Math.Round(terms.Quantity, 6) != terms.Quantity
            || terms.UnitPrice is <= 0 or > 10_000_000 || Math.Round(terms.UnitPrice, 6) != terms.UnitPrice)
            throw new ArgumentException("Invalid schedule dates, frequency, quantity or price.");
        _ = DueAt(nextOn, terms.Brand.TimeZone);
        Terms = terms;
        NextOn = nextOn;
        MakerIssuer = maker.Issuer;
        MakerSubject = maker.Subject;
        PendingReason = null;
        Version++;
    }

    public void SetPaused(bool paused)
    {
        if (Paused == paused) return;
        Paused = paused;
        Version++;
    }

    public bool Ready(DateOnly on, DateTimeOffset now) => !Paused && NextOn == on && DueAt(on, Terms.Brand.TimeZone) <= now;

    public void Complete(DateOnly on)
    {
        if (NextOn != on || Paused) throw new LedgerRuleException("The recurring occurrence changed.");
        LastOn = on;
        NextOn = Following(on);
        PendingReason = null;
    }

    public void WaitFor(string reason) => PendingReason = reason;

    public DateOnly[] Preview(int count)
    {
        if (count is < 1 or > 24) throw new ArgumentException("Preview between one and twenty-four dates.");
        var dates = new List<DateOnly>(count);
        for (var date = NextOn; date is DateOnly next && dates.Count < count; date = Following(next)) dates.Add(next);
        return dates.ToArray();
    }

    private DateOnly? Following(DateOnly on)
    {
        if (on.Year * 12 + on.Month - 1 + Terms.IntervalMonths >= 9999 * 12) return null;
        var month = new DateOnly(on.Year, on.Month, 1).AddMonths(Terms.IntervalMonths);
        var date = new DateOnly(month.Year, month.Month, Math.Min(Terms.AnchorDay, DateTime.DaysInMonth(month.Year, month.Month)));
        return date > Terms.EndsOn ? null : date;
    }

    public static DateTimeOffset DueAt(DateOnly date, string zone)
    {
        var timeZone = TimeZoneInfo.FindSystemTimeZoneById(zone);
        var time = date.ToDateTime(new TimeOnly(9, 0));
        // A skipped local date is due at the first valid local time that follows it.
        while (timeZone.IsInvalidTime(time)) time = time.AddMinutes(30);
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(time, timeZone));
    }
}
