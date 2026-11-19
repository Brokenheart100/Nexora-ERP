using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Nexora.Finance.Application;
using Nexora.ServiceDefaults.Http;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static class TaxFilingEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/tax";
    private const string Calendar = Root + "/calendar";
    private const string Period = Root + "/periods/{on}";
    private const string Filing = Root + "/filings/{id:guid}";

    [Authorize, WolverineGet(Calendar)]
    public static Task<TaxCalendarView> ReadCalendar(Guid workspaceId, TaxFilings service, CancellationToken ct) =>
        service.CalendarAsync(workspaceId, ct);

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePut(Calendar)]
    public static Task<TaxCalendarView> ChangeCalendar(Guid workspaceId, TaxCalendarRequest request, IMessageBus bus,
        CancellationToken ct) => bus.InvokeAsync<TaxCalendarView>(
        new SetTaxCalendar(workspaceId, request.OperationId, request.ExpectedVersion, request.Cycle, request.Basis), ct);

    [Authorize, WolverineGet(Period)]
    public static Task<TaxPeriodView> ReadPeriod(Guid workspaceId, string on, TaxFilings service, CancellationToken ct) =>
        service.PeriodAsync(workspaceId, ParseDate(on), ct);

    [Authorize, WolverineGet(Filing)]
    public static Task<TaxFilingView> Detail(Guid workspaceId, Guid id, TaxFilings service, CancellationToken ct) =>
        service.DetailAsync(workspaceId, id, ct);

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Period + "/filings")]
    public static async Task<Created<TaxFilingView>> Record(Guid workspaceId, string on, TaxFilingRequest request,
        IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<TaxFilingView>(new RecordTaxFiling(workspaceId, request.OperationId,
            ParseDate(on), request.ExpectedVersion, request.ExpectedFingerprint, request.Reference, request.Reason, request.LockBooks), ct);
        return TypedResults.Created($"/api/finance/workspaces/{workspaceId}/tax/filings/{result.Filing.Id}", result);
    }

    private static DateOnly ParseDate(string value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date : throw new ArgumentException("Use a date formatted as yyyy-MM-dd.");
}
