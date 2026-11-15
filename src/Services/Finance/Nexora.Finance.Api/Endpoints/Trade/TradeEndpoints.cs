using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
    [Authorize, WolverineGet(Root + "/receipts")]
    public static Task<AccrualView[]> Receipts(Guid workspaceId, [FromQuery] int? page, TradeUseCases service, CancellationToken ct) =>
        service.ReceiptsAsync(workspaceId, page ?? 1, ct);
    [Authorize, WolverineGet(Root + "/banks/{id:guid}/movements")]
    public static Task<BankMovement[]> Movements(Guid workspaceId, Guid id, [FromQuery] int? page, TradeUseCases service, CancellationToken ct) =>
        service.MovementsAsync(workspaceId, id, page ?? 1, ct);
    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/setup")]
    public static Task<TradeChange> Setup(Guid workspaceId, SetupRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ConfigureTrade(workspaceId, request.OperationId, request.Accounts), ct);
    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/banks")]
    public static Task<TradeChange> OpenBank(Guid workspaceId, BankRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new OpenBank(workspaceId, request.OperationId, request.Code, request.Name, request.Kind, request.AccountId), ct);
    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/banks/{id:guid}/default")]
    public static Task<TradeChange> Default(Guid workspaceId, Guid id, VersionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new DefaultBank(workspaceId, request.OperationId, id, request.ExpectedVersion), ct);
    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/documents")]
    public static Task<TradeChange> Submit(Guid workspaceId, SubmitRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new SubmitTrade(workspaceId, request.OperationId, request.Terms), ct);
    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/documents/{id:guid}/decision")]
    public static Task<TradeChange> Decide(Guid workspaceId, Guid id, DecideRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new DecideTrade(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Decision), ct);
    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/receipts/{id:guid}/accrue")]
    public static Task<TradeChange> Accrue(Guid workspaceId, Guid id, OperationRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ProcessAccrual(workspaceId, request.OperationId, id), ct);

    [Authorize, WolverinePost(Root + "/imports/preview")]
    public static Task<BankPreviewView> Preview(Guid workspaceId, PreviewRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<BankPreviewView>(new PreviewBankImport(workspaceId, request.BankId, request.File, request.Mapping), ct);
    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/imports/{id:guid}/commit")]
    public static Task<BankImportResult> Commit(Guid workspaceId, Guid id, OperationRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<BankImportResult>(new CommitBankImport(workspaceId, request.OperationId, id), ct);
    [Authorize, WolverineGet(Root + "/banks/{id:guid}/statement")]
    public static Task<StatementLine[]> Lines(Guid workspaceId, Guid id, [FromQuery] int? page, BankImportUseCases service, CancellationToken ct) =>
        service.ListAsync(workspaceId, id, page ?? 1, ct);
    [Authorize, WolverineGet(Root + "/statement/{id:guid}/matches")]
    public static Task<StatementMatch[]> Matches(Guid workspaceId, Guid id, BankImportUseCases service, CancellationToken ct) =>
        service.MatchesAsync(workspaceId, id, ct);
    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/statement/{id:guid}/matches")]
    public static Task<TradeChange> Match(Guid workspaceId, Guid id, MatchRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new MatchStatement(workspaceId, request.OperationId, id, request.MovementId, request.ExpectedVersion, request.Amount), ct);
    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/matches/{id:guid}/release")]
    public static Task<TradeChange> Release(Guid workspaceId, Guid id, ReasonRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ReleaseMatch(workspaceId, request.OperationId, id, request.Reason), ct);
    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/statement/{id:guid}/exclude")]
    public static Task<TradeChange> Exclude(Guid workspaceId, Guid id, ExcludeRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ExcludeStatement(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Exclude, request.Reason), ct);
}
