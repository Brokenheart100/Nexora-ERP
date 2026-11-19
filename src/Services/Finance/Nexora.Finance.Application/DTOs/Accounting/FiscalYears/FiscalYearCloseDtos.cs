using Nexora.Finance.Domain;
using System.Text.Json.Serialization;

namespace Nexora.Finance.Application;

public sealed record FiscalYearPreview(StatementPeriod Period, Guid EquityAccountId, decimal NetProfit, FiscalClosingLine[] Lines,
    DateOnly[] OpenMonths,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] int PendingDocuments = 0,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] FiscalPartnerClosing[]? PartnerAllocations = null);

public sealed record FiscalPartnerClosing(string Code, string Name, decimal Share, FiscalClosingLine Capital, FiscalClosingLine Drawings);

public sealed record FiscalYearView(Guid Id, long Version, string State, FiscalYearPreview Report, Guid[] ClosingJournals,
    Guid[] ReopeningJournals, string? ReopenReason);
