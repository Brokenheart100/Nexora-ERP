namespace Nexora.Finance.Domain;

public sealed record RecurringTerms(Guid CustomerId, string CustomerName, Guid ServiceId, string ServiceName, decimal Quantity,
    decimal UnitPrice, InvoiceBrand Brand, int IntervalMonths, int AnchorDay, DateOnly? EndsOn, int DueDays);
