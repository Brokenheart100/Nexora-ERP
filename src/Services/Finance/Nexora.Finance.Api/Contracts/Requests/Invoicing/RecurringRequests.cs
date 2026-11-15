using Nexora.Finance.Application;

namespace Nexora.Finance.Api;

public static partial class RecurringEndpoints
{
    public sealed record SaveRequest(Guid OperationId, long ExpectedVersion, ScheduleInput Input);
    public sealed record PauseRequest(Guid OperationId, long ExpectedVersion, bool Paused);
    public sealed record RunRequest(Guid OperationId, DateOnly On);
}
