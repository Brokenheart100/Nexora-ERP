using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class TradeEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/trade";

    [Authorize, WolverineGet(Root)]
    public static Task<TradeHome> Home(Guid workspaceId, TradeUseCases service, CancellationToken ct) => service.HomeAsync(workspaceId, ct);
    [Authorize, WolverineGet(Root + "/documents")]
    public static Task<TradeDocumentView[]> Documents(Guid workspaceId, [FromQuery] int? page, TradeUseCases service, CancellationToken ct) =>
        service.DocumentsAsync(workspaceId, page ?? 1, ct);
    [Authorize, WolverineGet(Root + "/bills")]
    public static Task<TradeDocumentView[]> PostedBills(Guid workspaceId, [FromQuery] int? page, TradeUseCases service, CancellationToken ct) =>
        service.DocumentsAsync(workspaceId, page ?? 1, ct, postedBillsOnly: true);
    [Authorize, WolverineGet(Root + "/banks")]
    public static Task<BankView[]> Banks(Guid workspaceId, [FromQuery] int? page, TradeUseCases service, CancellationToken ct) =>
        service.BanksAsync(workspaceId, page ?? 1, ct);
    [Authorize, WolverineGet(Root + "/documents/{id:guid}")]
    public static Task<TradeDocumentView> Document(Guid workspaceId, Guid id, TradeUseCases service, CancellationToken ct) =>
        service.DetailAsync(workspaceId, id, ct);
    [Authorize, WolverineGet(Root + "/receipts")]
    public static Task<AccrualView[]> Receipts(Guid workspaceId, [FromQuery] int? page, TradeUseCases service, CancellationToken ct) =>
        service.ReceiptsAsync(workspaceId, page ?? 1, ct);
    [Authorize, WolverineGet(Root + "/banks/{id:guid}/movements")]
    public static Task<BankMovement[]> Movements(Guid workspaceId, Guid id, [FromQuery] int? page, TradeUseCases service, CancellationToken ct) =>
        service.MovementsAsync(workspaceId, id, page ?? 1, ct);
    [RevisionTagged]
    [Authorize, WolverineGet(Root + "/banks/{id:guid}")]
    public static async Task<BankView> Bank(Guid workspaceId, Guid id, HttpResponse response, TradeUseCases service, CancellationToken ct)
    {
        var result = await service.BankDetailAsync(workspaceId, id, ct);
        ApiIdempotency.SetRevision(response, result.Version);
        return result;
    }
    [ApiWrite]
    [Authorize, WolverinePost(Root + "/setup")]
    public static Task<TradeChange> Setup(Guid workspaceId, SetupRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ConfigureTrade(workspaceId, request.OperationId, request.Accounts), ct);
    [ApiWrite]
    [Authorize, WolverinePost(Root + "/banks")]
    public static async Task<Created<TradeChange>> OpenBank(Guid workspaceId, BankRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<TradeChange>(new OpenBank(workspaceId, request.OperationId, request.Code, request.Name,
            request.Kind, request.AccountId), ct);
        return TypedResults.Created($"/api/finance/workspaces/{workspaceId}/trade/banks/{result.Id}", result);
    }
    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/banks/{id:guid}/default")]
    public static Task<TradeChange> Default(Guid workspaceId, Guid id, VersionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new DefaultBank(workspaceId, request.OperationId, id, request.ExpectedVersion), ct);
    [ApiWrite]
    [Authorize, WolverinePost(Root + "/documents")]
    public static async Task<Created<TradeChange>> Submit(Guid workspaceId, SubmitRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<TradeChange>(new SubmitTrade(workspaceId, request.OperationId, request.Terms), ct);
        return TypedResults.Created($"/api/finance/workspaces/{workspaceId}/trade/documents/{result.Id}", result);
    }
    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/documents/{id:guid}/decision")]
    public static Task<TradeChange> Decide(Guid workspaceId, Guid id, DecideRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new DecideTrade(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Decision), ct);
    [ApiWrite]
    [Authorize, WolverinePost(Root + "/receipts/{id:guid}/accrue")]
    public static Task<TradeChange> Accrue(Guid workspaceId, Guid id, OperationRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ProcessAccrual(workspaceId, request.OperationId, id), ct);

    [Authorize, WolverinePost(Root + "/imports/preview")]
    public static async Task<Results<Created<BankPreviewView>, Ok<BankPreviewView>>> Preview(Guid workspaceId, PreviewRequest request,
        IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<BankPreviewView>(new PreviewBankImport(workspaceId, request.BankId, request.File, request.Mapping), ct);
        return result.PreviewId is { } id ? TypedResults.Created($"/api/finance/workspaces/{workspaceId}/trade/imports/{id}", result)
            : TypedResults.Ok(result);
    }
    [Authorize, WolverineGet(Root + "/imports/{id:guid}")]
    public static Task<BankImportStatus> ImportStatus(Guid workspaceId, Guid id, BankImportUseCases service, CancellationToken ct) =>
        service.StatusAsync(workspaceId, id, ct);
    [ApiWrite]
    [Authorize, WolverinePost(Root + "/imports/{id:guid}/commit")]
    public static Task<BankImportResult> Commit(Guid workspaceId, Guid id, OperationRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<BankImportResult>(new CommitBankImport(workspaceId, request.OperationId, id), ct);
    [Authorize, WolverineGet(Root + "/banks/{id:guid}/statement")]
    public static Task<StatementLine[]> Lines(Guid workspaceId, Guid id, [FromQuery] int? page, [FromQuery] int? pageSize,
        BankImportUseCases service, CancellationToken ct) =>
        service.ListAsync(workspaceId, id, new PageWindow(page ?? 1, pageSize ?? PageWindow.DefaultSize), ct);
    [Authorize, WolverineGet(Root + "/statement/{id:guid}/matches")]
    public static Task<StatementMatch[]> Matches(Guid workspaceId, Guid id, BankImportUseCases service, CancellationToken ct) =>
        service.MatchesAsync(workspaceId, id, ct);
    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/statement/{id:guid}/matches")]
    public static Task<TradeChange> Match(Guid workspaceId, Guid id, MatchRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new MatchStatement(workspaceId, request.OperationId, id, request.MovementId, request.ExpectedVersion, request.Amount), ct);
    [ApiWrite]
    [Authorize, WolverinePost(Root + "/matches/{id:guid}/release")]
    public static Task<TradeChange> Release(Guid workspaceId, Guid id, ReasonRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ReleaseMatch(workspaceId, request.OperationId, id, request.Reason), ct);
    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/statement/{id:guid}/exclude")]
    public static Task<TradeChange> Exclude(Guid workspaceId, Guid id, ExcludeRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ExcludeStatement(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Exclude, request.Reason), ct);
}
