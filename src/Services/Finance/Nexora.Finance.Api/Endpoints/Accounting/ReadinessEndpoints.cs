using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class ReadinessEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/readiness";

    [Authorize, WolverineGet(Root)]
    public static Task<ReadinessView> Read(Guid workspaceId, ReadinessUseCases readiness, CancellationToken ct) =>
        readiness.ReadAsync(workspaceId, ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/backfill")]
    public static Task<BackfillResult> Backfill(Guid workspaceId, BackfillRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<BackfillResult>(new BackfillReadiness(workspaceId, request.OperationId, request.Through), ct);
}
