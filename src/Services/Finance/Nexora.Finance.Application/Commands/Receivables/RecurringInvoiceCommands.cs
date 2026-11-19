namespace Nexora.Finance.Application;

public sealed record SkipInvoiceSchedule(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, DateOnly On);

public sealed record SaveInvoiceSchedule(Guid WorkspaceId, Guid OperationId, Guid? Id, long ExpectedVersion, ScheduleInput Input);

public sealed record PauseInvoiceSchedule(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, bool Paused);

public sealed record RunInvoiceSchedule(Guid WorkspaceId, Guid OperationId, Guid Id, DateOnly On);

public sealed record InvoiceScheduleDue(Guid TenantId, Guid WorkspaceId, Guid Id, long Version, DateOnly On);
