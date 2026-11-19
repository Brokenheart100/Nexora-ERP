using System.Text.Json.Serialization;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record TaxCalendarView(string Cycle, long Version, DateOnly? LockedThrough, bool CanManage, bool CanLock,
    string Basis, bool CanChangeCalendar);

public sealed record TaxPosting(DateOnly On, long PostingNumber, Guid JournalId, Guid DocumentId, string DocumentNumber,
    string Kind, string Direction, string Code, decimal Amount,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Guid? TaxDocumentId = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? TaxDocumentNumber = null);

public sealed record TaxCodeTotal(string Code, decimal Input, decimal Output, decimal NetPayable);

public sealed record TaxPeriodTotals(TaxPeriod Period, string Currency, long Watermark, string Fingerprint, decimal Input,
    decimal Output, decimal NetPayable, TaxCodeTotal[] Codes, TaxPosting[] Sources, string Basis = "accrual");

public sealed record TaxFilingEntry(Guid Id, DateOnly From, DateOnly Through, long Version, Guid? CorrectsId, string Reference,
    string? Reason, DateTimeOffset RecordedAtUtc, bool LockBooks, string Fingerprint);

public sealed record TaxFilingView(TaxFilingEntry Filing, TaxPeriodTotals Snapshot);

public sealed record TaxPeriodView(TaxPeriodTotals Current, TaxFilingEntry[] Filings, bool ChangedSinceFiling,
    DateOnly? LockedThrough);
