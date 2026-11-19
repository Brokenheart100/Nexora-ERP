namespace Nexora.Finance.Domain;

public sealed record InvoiceOccurrence(Guid TenantId, Guid WorkspaceId, Guid ScheduleId, DateOnly On, long TemplateVersion,
    Guid? DocumentId, DateTimeOffset CreatedAtUtc);
