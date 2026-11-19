using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.Finance.Application;
using Nexora.ServiceDefaults.Http;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class LedgerEndpoints
{
    [Authorize, WolverinePost(Root + "/opening-balances/preview")]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict, "application/problem+json")]
    public static Task<OpeningBalancePreview> PreviewOpening(Guid workspaceId, OpeningBalancePreviewRequest request,
        LedgerUseCases ledger, CancellationToken ct) => ledger.PreviewOpeningAsync(workspaceId, request.On, request.File, ct);

    [Authorize, ApiWrite, WolverinePost(Root + "/opening-balances/import")]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound, "application/problem+json")]
    public static async Task<Created<LedgerChange>> ImportOpening(Guid workspaceId, OpeningBalanceImportRequest request,
        IMessageBus bus, CancellationToken ct) => CreatedJournal(workspaceId, await bus.InvokeAsync<LedgerChange>(
            new ImportOpeningBalances(workspaceId, request.OperationId, request.On, request.Memo, request.File, request.FileHash,
                request.ChartRevision), ct));
}
