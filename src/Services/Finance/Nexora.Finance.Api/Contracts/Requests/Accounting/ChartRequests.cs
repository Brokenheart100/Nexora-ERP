using Nexora.Finance.Application;

namespace Nexora.Finance.Api;

public sealed record SaveChartAccountRequest(Guid OperationId, long ExpectedRevision, long? ExpectedVersion, AccountInput Account);

public sealed record PreviewChartImportRequest(string Mode, string Format, string File);

public sealed record CommitChartImportRequest(Guid OperationId);
