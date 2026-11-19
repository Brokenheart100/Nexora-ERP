using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class TaxEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/tax";

    [Authorize, WolverineGet(Root)]
    public static Task<TaxSetup> Get(Guid workspaceId, TaxUseCases taxes, CancellationToken ct) => taxes.ReadAsync(workspaceId, ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/rates")]
    public static Task<TaxChange> AddRate(Guid workspaceId, RateRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TaxChange>(new SetTaxRate(workspaceId, request.OperationId, request.Code, request.Name, request.EffectiveOn,
            request.Rate ?? throw new ArgumentException("A tax rate is required.")), ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/groups")]
    public static Task<TaxChange> SaveGroup(Guid workspaceId, GroupRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TaxChange>(new SetTaxGroup(workspaceId, request.OperationId, request.Code, request.Name, request.ExpectedVersion, request.RateCodes), ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/classifications")]
    public static Task<TaxChange> Classify(Guid workspaceId, ClassificationRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TaxChange>(new ClassifyForTax(workspaceId, request.OperationId, request.Kind,
            request.ResourceId, request.GroupCode, request.ExpectedVersion), ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/assessments")]
    public static Task<TaxSnapshot> Assess(Guid workspaceId, AssessRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TaxSnapshot>(new AssessTax(workspaceId, request.OperationId, request.On, request.GroupCode,
            request.ItemId, request.PartnerId, request.UnitPrice ?? throw new ArgumentException("A unit price is required."),
            request.Quantity ?? throw new ArgumentException("A quantity is required."), request.Discount ?? 0,
            request.IncludesTax ?? throw new ArgumentException("Specify whether the unit price includes tax.")), ct);

    [Authorize, WolverineGet(Root + "/assessments/{id:guid}")]
    public static Task<TaxSnapshot> Snapshot(Guid workspaceId, Guid id, TaxUseCases taxes, CancellationToken ct) =>
        taxes.ReadSnapshotAsync(workspaceId, id, ct);
}
