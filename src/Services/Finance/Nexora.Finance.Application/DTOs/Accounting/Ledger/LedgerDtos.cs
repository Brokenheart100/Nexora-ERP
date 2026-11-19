using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record JournalDraftInput(DateOnly On, string Memo, JournalLineInput[] Lines, [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] string? CashActivity = null);

public sealed record LedgerChange(Guid Id, long Version);

public sealed record PeriodChange(DateOnly Month, long Version);

public sealed record PeriodCheck(long Watermark, int PostedCount, int PendingCount, decimal Debit, decimal Credit);

public sealed record PeriodView(DateOnly Month, string State, long Version, long? ClosingWatermark);

public sealed record PeriodDetail(PeriodView Period, PeriodCheck Check, PeriodTransition[] History);

public sealed record LedgerHome(string Currency, int MinorUnits, DateOnly StartsOn, bool CanDraft, bool CanPost, bool CanReverse,
    bool CanManagePeriods, PeriodView[] Periods, bool CanConfigurePartnership = false);

public sealed record JournalSummary(Guid Id, string Kind, string SourceNumber, DateOnly On, string Memo, string State,
    long Version, long? PostingNumber, Guid? ReversesId, string? ImportProvider = null, string? ExternalId = null);

public sealed record ImportedJournalVersion(Guid Id, long Version);

public sealed record JournalView(JournalSummary Journal, JournalLineSnapshot[] Lines, JournalActor Maker,
    JournalActor? Reviewer, long? ApprovedVersion, DateTimeOffset? PostedAtUtc, bool IsMaker, [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] string? CashActivity = null);

public sealed record BalanceRow(Guid AccountId, string Code, string Name, decimal Debit, decimal Credit)
{
    public decimal Balance => Debit - Credit;
}

public sealed record TrialBalance(DateOnly Through, string Currency, decimal Debit, decimal Credit, BalanceRow[] Accounts);
