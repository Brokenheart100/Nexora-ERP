namespace Nexora.Finance.Application;

public sealed record ReadinessCheck(string Code, string Severity, int Count, string Message);

public sealed record ReadinessBook(bool Exists, string Currency, int MinorUnits, DateOnly? StartsOn,
    long LastPostingNumber, string Opening, bool HasPostings);

public sealed record ReadinessDocument(Guid Id, string Kind, string Number, DateOnly On, decimal Amount);

public sealed record PendingCost(Guid Id, DateOnly On, string Kind, decimal Amount, string Reason);

public sealed record ReadinessView(bool Ready, ReadinessBook Book, ReadinessCheck[] Checks,
    ReadinessDocument[] MissingDocuments, int MissingDocumentCount, PendingCost[] PendingCosts,
    int PendingCostCount, DateTimeOffset GeneratedAt);

public sealed record BackfilledCost(Guid Id, DateOnly On, decimal Amount, Guid? JournalId);

public sealed record BlockedCost(Guid Id, DateOnly On, decimal Amount, string Reason);

public sealed record CostBackfill(BackfilledCost[] Posted, BlockedCost[] Blocked);

public sealed record BackfillResult(BackfilledCost[] Posted, BlockedCost[] Blocked, bool Replayed, ReadinessView Readiness);
