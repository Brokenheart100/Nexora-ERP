using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record BankCsvMapping(string ExternalId, string Date, string Amount, string Description);

public sealed record StatementIssue(int Row, string Message);

public sealed record StatementPreviewRow(StatementEntry Entry, bool Duplicate);

public sealed record BankPreviewView(Guid? PreviewId, string FileHash, StatementPreviewRow[] Rows, StatementIssue[] Errors,
    StatementIssue[]? Skipped = null);

public sealed record BankImportResult(Guid Id, int Count);

public sealed record BankImportStatus(Guid Id, Guid BankId, string State, DateTimeOffset ExpiresAtUtc, int? CommittedCount);
