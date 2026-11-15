using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record ScheduleInput(Guid CustomerId, Guid ServiceId, decimal Quantity, decimal UnitPrice,
    DateOnly NextOn, DateOnly? EndsOn, int IntervalMonths, int DueDays);

public sealed record ScheduleWake(InvoiceScheduleDue Command, DateTimeOffset At);

public sealed record ScheduleChange(Guid Id, long Version, Guid? InvoiceId = null, string? PendingReason = null);

public sealed record ScheduleView(Guid Id, long Version, bool Paused, RecurringTerms Terms, DateOnly? NextOn,
    DateOnly? LastOn, string? PendingReason, DateOnly[] Preview);
