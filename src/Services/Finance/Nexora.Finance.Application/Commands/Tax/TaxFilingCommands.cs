using System.Text.Json.Serialization;

namespace Nexora.Finance.Application;

public sealed record SetTaxCalendar(Guid WorkspaceId, Guid OperationId, long ExpectedVersion, string Cycle,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Basis = null);

public sealed record RecordTaxFiling(Guid WorkspaceId, Guid OperationId, DateOnly On, long ExpectedVersion,
    string ExpectedFingerprint, string Reference, string? Reason, bool LockBooks);
