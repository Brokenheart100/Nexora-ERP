using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record FiscalYearPreview(StatementPeriod Period, Guid EquityAccountId, decimal NetProfit, FiscalClosingLine[] Lines,
    DateOnly[] OpenMonths,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingDefault)] int PendingDocuments = 0);

public sealed record FiscalYearView(Guid Id, long Version, string State, FiscalYearPreview Report, Guid[] ClosingJournals,
    Guid[] ReopeningJournals, string? ReopenReason);
