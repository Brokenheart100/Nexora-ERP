namespace Nexora.Finance.Application;

public sealed record QueueReportExport(Guid WorkspaceId, Guid OperationId, string Kind, DateOnly From, DateOnly Through,
    bool Compare, long Watermark, string? Basis);

public sealed record RebuildReportExport(Guid WorkspaceId, Guid OperationId, Guid Id);

public sealed record BuildReportExport(Guid TenantId, Guid WorkspaceId, Guid Id);
