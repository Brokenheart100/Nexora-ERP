namespace Nexora.Finance.Api;

public sealed record TaxCalendarRequest(Guid OperationId, long ExpectedVersion, string Cycle, string? Basis);

public sealed record TaxFilingRequest(Guid OperationId, long ExpectedVersion, string ExpectedFingerprint,
    string Reference, string? Reason, bool LockBooks);
