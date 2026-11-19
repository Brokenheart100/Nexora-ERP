using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static class BookEndpoints
{
    [Authorize, WolverineGet("/api/finance/workspaces/{workspaceId:guid}/book")]
    public static Task<BookView> Get(Guid workspaceId, BookUseCases useCases, CancellationToken ct) => useCases.ReadAsync(workspaceId, ct);

    [ApiWrite]
    [Authorize, WolverinePost("/api/finance/workspaces/{workspaceId:guid}/book")]
    public static Task<BookView> Initialize(Guid workspaceId, InitializeBookRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<BookView>(new InitializeBook(workspaceId, request.OperationId, request.BaseCurrency,
            request.StartsOn, request.FiscalYearStartMonth), ct);
}
