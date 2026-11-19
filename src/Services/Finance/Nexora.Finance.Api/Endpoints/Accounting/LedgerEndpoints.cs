using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class LedgerEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/ledger";
    private const string Journals = Root + "/journals";
    private const string Journal = Journals + "/{id:guid}";
    private const string Period = Root + "/periods/{month}";
    private const string Links = Root + "/links";
    private const string Imported = Journals + "/imported";

    [Authorize, ApiWrite, WolverinePost(Imported)]
    public static async Task<Created<LedgerChange>> Import(Guid workspaceId, ImportRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<LedgerChange>(
            new ImportJournal(workspaceId, request.OperationId, request.Provider, request.ExternalId, request.Draft), ct);
        return CreatedJournal(workspaceId, result);
    }

    [Authorize, ApiWrite, WolverinePost(Imported + "/batch-decision")]
    public static Task<LedgerChange[]> BatchDecision(Guid workspaceId, ImportedBatchRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<LedgerChange[]>(
            new DecideImportedJournals(workspaceId, request.OperationId, request.Decision, request.Journals), ct);

    [Authorize, WolverineGet(Root)]
    public static Task<LedgerHome> Home(Guid workspaceId, LedgerUseCases ledger, CancellationToken ct) => ledger.HomeAsync(workspaceId, ct);

    [Authorize, WolverineGet(Journals)]
    public static Task<JournalSummary[]> List(Guid workspaceId, [FromQuery] DateOnly? month, [FromQuery] Guid? accountId,
        [FromQuery] bool? postedOnly, [FromQuery] int? page, [FromQuery] int? pageSize, LedgerUseCases ledger, CancellationToken ct) =>
        ledger.ListAsync(workspaceId, month, accountId, postedOnly ?? false, new PageWindow(page ?? 1, pageSize ?? PageWindow.DefaultSize), ct);

    [Authorize, WolverineGet(Journal)]
    public static Task<JournalView> Detail(Guid workspaceId, Guid id, LedgerUseCases ledger, CancellationToken ct) =>
        ledger.DetailAsync(workspaceId, id, ct);

    [ApiWrite]
    [Authorize, WolverinePost(Journals)]
    public static async Task<Created<LedgerChange>> Start(Guid workspaceId, StartRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<LedgerChange>(new StartJournal(workspaceId, request.OperationId, request.Kind, request.SourceNumber, request.Draft), ct);
        return CreatedJournal(workspaceId, result);
    }

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePut(Journal)]
    public static Task<LedgerChange> Edit(Guid workspaceId, Guid id, EditRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<LedgerChange>(new EditJournal(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Draft), ct);

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Journal + "/decision")]
    public static Task<LedgerChange> Decide(Guid workspaceId, Guid id, DecisionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<LedgerChange>(new DecideJournal(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Decision), ct);

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Journal + "/reversal")]
    public static async Task<Created<LedgerChange>> Reverse(Guid workspaceId, Guid id, ReverseRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<LedgerChange>(new ReverseJournal(workspaceId, request.OperationId, id, request.ExpectedVersion, request.On, request.Reason), ct);
        return CreatedJournal(workspaceId, result);
    }

    private static Created<LedgerChange> CreatedJournal(Guid workspaceId, LedgerChange result) =>
        TypedResults.Created($"/api/finance/workspaces/{workspaceId}/ledger/journals/{result.Id}", result);

    [Authorize, WolverineGet(Period)]
    public static Task<PeriodDetail> ReadPeriod(Guid workspaceId, string month, LedgerUseCases ledger, CancellationToken ct) =>
        ledger.PeriodAsync(workspaceId, ParseDate(month), ct);

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Period)]
    public static Task<PeriodChange> MovePeriod(Guid workspaceId, string month, PeriodRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<PeriodChange>(new MoveFiscalPeriod(workspaceId, request.OperationId, ParseDate(month), request.ExpectedVersion,
            request.Action, request.Reason), ct);

    [Authorize, WolverineGet(Links)]
    public static Task<JournalLinkView[]> LinksList(Guid workspaceId, [FromQuery] Guid? journalId, [FromQuery] int? page,
        LedgerUseCases ledger, CancellationToken ct) => ledger.LinksAsync(workspaceId, journalId, page ?? 1, ct);

    [Authorize, WolverineGet(Links + "/scan")]
    public static Task<JournalLinkScan> ScanLinks(Guid workspaceId, LedgerUseCases ledger, CancellationToken ct) =>
        ledger.ScanLinksAsync(workspaceId, ct);

    [ApiWrite]
    [Authorize, WolverinePost(Links)]
    public static Task<JournalLinkChange> CreateLink(Guid workspaceId, CreateLinkRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<JournalLinkChange>(new CreateJournalLink(workspaceId, request.OperationId, request.FromJournalId,
            request.ToJournalId, request.Kind, request.Memo), ct);

    [ApiWrite]
    [Authorize, WolverinePost(Links + "/{linkId:guid}/delete")]
    public static Task<JournalLinkChange> DeleteLink(Guid workspaceId, Guid linkId, DeleteLinkRequest request, IMessageBus bus,
        CancellationToken ct) => bus.InvokeAsync<JournalLinkChange>(new DeleteJournalLink(workspaceId, request.OperationId, linkId,
            request.ExpectedVersion), ct);

    [Authorize, WolverineGet(Root + "/trial-balance/{through}")]
    public static Task<TrialBalance> Balance(Guid workspaceId, string through, LedgerUseCases ledger, CancellationToken ct) =>
        ledger.BalancesAsync(workspaceId, ParseDate(through), ct);

    private static DateOnly ParseDate(string value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None, out var date) && date.Year is >= 1900 and <= 9998
            ? date : throw new ArgumentException("Use a date formatted as yyyy-MM-dd.");
}
