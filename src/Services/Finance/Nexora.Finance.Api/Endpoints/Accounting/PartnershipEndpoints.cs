using Microsoft.AspNetCore.Authorization;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;
using Nexora.ServiceDefaults.Http;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static class PartnershipEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/ledger/partnerships/{year:int}";

    [Authorize, WolverineGet(Root)]
    public static Task<PartnershipView> Read(Guid workspaceId, int year, Partnerships service, CancellationToken ct) =>
        service.ReadAsync(workspaceId, year, ct);

    [Authorize, ApiWrite("expectedVersion"), WolverinePut(Root)]
    public static Task<PartnershipView> Configure(Guid workspaceId, int year, PartnershipRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<PartnershipView>(new ConfigurePartnership(workspaceId, request.OperationId, year, request.ExpectedVersion, request.Partners), ct);

    public sealed record PartnershipRequest(Guid OperationId, long ExpectedVersion, PartnerCapital[] Partners);
}
