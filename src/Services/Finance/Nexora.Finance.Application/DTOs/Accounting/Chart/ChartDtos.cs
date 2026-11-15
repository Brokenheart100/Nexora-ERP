using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record ChartState(AccountingBook Book, IReadOnlyList<ChartAccount> Accounts);

public sealed record ChartAccountView(Guid Id, string Code, string Name, string Category, string? ParentCode,
    string Purpose, bool IsArchived, bool IsUsed, long Version);

public sealed record ChartView(long Revision, bool CanManage, bool CanImport, bool CanExport, IReadOnlyList<ChartAccountView> Accounts);

public sealed record ChartRevisionResult(long Revision);

public sealed record ChartImportChange(long? Row, string Code, string Name, string Action);

public sealed record ChartPreviewView(Guid? PreviewId, long Revision, string FileHash,
    IReadOnlyList<ChartImportChange> Changes, IReadOnlyList<ChartImportIssue> Errors);

public sealed record ChartExportView(string Format, string Template, IReadOnlyList<AccountInput> Accounts);

public sealed record ChartSnapshotView(string Format, string Template, Guid WorkspaceId, long Revision,
    IReadOnlyList<ChartAccountView> Accounts);
