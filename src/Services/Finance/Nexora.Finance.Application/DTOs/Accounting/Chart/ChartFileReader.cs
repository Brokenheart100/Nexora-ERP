using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record AccountInput(string Code, string Name, string Category, string? ParentCode = null,
    string? Purpose = null, bool IsArchived = false)
{
    public AccountDefinition Parse() => AccountDefinition.Parse(Code, Name, Category, ParentCode, Purpose, IsArchived);
}

public sealed record ChartImportIssue(long? Row, string? Code, string Message);

public sealed record ImportedAccount(long Row, AccountDefinition Definition);

public sealed record ParsedChart(IReadOnlyList<ImportedAccount> Accounts, IReadOnlyList<ChartImportIssue> Errors);
