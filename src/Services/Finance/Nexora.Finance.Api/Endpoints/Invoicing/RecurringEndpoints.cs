using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class RecurringEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/receivables/schedules";

    [Authorize, WolverineGet(Root)]
    public static Task<ScheduleView[]> Schedules(Guid workspaceId, [FromQuery] int? page, ReceivableUseCases service,
        IRecurringInvoices recurring, CancellationToken ct) => service.SchedulesAsync(workspaceId, page ?? 1, recurring, ct);

    [Authorize, WolverineGet(Root + "/{id:guid}/occurrences")]
    public static Task<Nexora.Finance.Domain.InvoiceOccurrence[]> History(Guid workspaceId, Guid id, [FromQuery] int? page,
        ReceivableUseCases service, IRecurringInvoices recurring, CancellationToken ct) =>
        service.OccurrencesAsync(workspaceId, id, page ?? 1, recurring, ct);

    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root)]
    public static Task<ScheduleChange> Create(Guid workspaceId, SaveRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<ScheduleChange>(new SaveInvoiceSchedule(workspaceId, request.OperationId, null, request.ExpectedVersion, request.Input), ct);

    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePut(Root + "/{id:guid}")]
    public static Task<ScheduleChange> Edit(Guid workspaceId, Guid id, SaveRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<ScheduleChange>(new SaveInvoiceSchedule(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Input), ct);

    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/{id:guid}/pause")]
    public static Task<ScheduleChange> Pause(Guid workspaceId, Guid id, PauseRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<ScheduleChange>(new PauseInvoiceSchedule(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Paused), ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/{id:guid}/run")]
    public static Task<ScheduleChange> Run(Guid workspaceId, Guid id, RunRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<ScheduleChange>(new RunInvoiceSchedule(workspaceId, request.OperationId, id, request.On), ct);
}
