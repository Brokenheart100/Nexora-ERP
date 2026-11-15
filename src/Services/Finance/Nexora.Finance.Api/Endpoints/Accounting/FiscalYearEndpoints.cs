using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class FiscalYearEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/ledger/fiscal-years";

    [Authorize, WolverineGet(Root)]
    public static Task<FiscalYearView[]> List(Guid workspaceId, FiscalYearCloses service, CancellationToken ct) =>
        service.ListAsync(workspaceId, ct);

    [Authorize, WolverineGet(Root + "/preview")]
    public static Task<FiscalYearPreview> Preview(Guid workspaceId, [FromQuery] int year, [FromQuery] Guid equityAccountId,
        FiscalYearCloses service, CancellationToken ct) => service.PreviewAsync(workspaceId, year, equityAccountId, ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Root)]
    public static Task<FiscalYearView> Prepare(Guid workspaceId, PrepareRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<FiscalYearView>(new PrepareFiscalYear(workspaceId, request.OperationId, request.Year, request.EquityAccountId), ct);

    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/{id:guid}/decision")]
    public static Task<FiscalYearView> Decide(Guid workspaceId, Guid id, DecisionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<FiscalYearView>(new DecideFiscalYear(workspaceId, request.OperationId, id, request.ExpectedVersion,
            request.Decision, request.Reason), ct);
}
