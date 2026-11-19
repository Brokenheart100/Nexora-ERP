using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Organization.Api;

public static class BillingEndpoints
{
    [RequireWorkspacePermission(WorkspacePermissions.BillingRead), WolverineGet("/api/workspaces/{id:guid}/billing")]
    public static Task<BillingView> Get(Guid id, BillingUseCases useCases, ICurrentActor actor, CancellationToken cancellationToken) =>
        useCases.GetAsync(id, actor.GetRequired(), cancellationToken);

    [RequireWorkspacePermission(WorkspacePermissions.Read), WolverineGet("/api/workspaces/{id:guid}/billing/entitlements")]
    public static Task<EntitlementsView> Entitlements(Guid id, BillingQueries queries, ICurrentActor actor, CancellationToken cancellationToken) =>
        queries.EntitlementsAsync(id, actor.GetRequired(), cancellationToken);

    [RequireWorkspacePermission(WorkspacePermissions.BillingManage), WolverineGet("/api/workspaces/{id:guid}/billing/plan-quote")]
    public static Task<PlanQuoteView> Quote(Guid id, [FromQuery] string planCode, BillingUseCases useCases, ICurrentActor actor, CancellationToken cancellationToken) =>
        useCases.QuoteAsync(id, planCode, actor.GetRequired(), cancellationToken);

    [ApiWrite]
    [RequireWorkspacePermission(WorkspacePermissions.BillingManage), WolverinePost("/api/workspaces/{id:guid}/billing/subscription")]
    public static Task<BillingView> SelectPlan(Guid id, SelectBillingPlanRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken cancellationToken) =>
        bus.InvokeAsync<BillingView>(new SelectBillingPlan(id, request.PlanCode, request.OperationId, request.PaymentReference, actor.GetRequired()), cancellationToken);

    [ApiWrite]
    [RequireWorkspacePermission(WorkspacePermissions.BillingManage), WolverinePost("/api/workspaces/{id:guid}/billing/invoices/{invoiceId:guid}/pay")]
    public static Task<BillingView> PayInvoice(Guid id, Guid invoiceId, PayBillingInvoiceRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken cancellationToken) =>
        bus.InvokeAsync<BillingView>(new PayBillingInvoice(id, invoiceId, request.OperationId, request.Reference, actor.GetRequired()), cancellationToken);

    [ApiWrite]
    [RequireWorkspacePermission(WorkspacePermissions.BillingManage), WolverinePost("/api/workspaces/{id:guid}/billing/subscription/cancel")]
    public static Task<BillingView> Cancel(Guid id, CancelBillingSubscriptionRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken cancellationToken) =>
        bus.InvokeAsync<BillingView>(new CancelBillingSubscription(id, request.OperationId, actor.GetRequired()), cancellationToken);

    [ApiWrite]
    [RequireWorkspacePermission(WorkspacePermissions.Read), WolverinePost("/api/workspaces/{id:guid}/billing/usage/documents")]
    public static Task<DocumentReservationView> ReserveDocuments(Guid id, ReserveBillingDocumentsRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken cancellationToken) =>
        bus.InvokeAsync<DocumentReservationView>(new ReserveBillingDocuments(id, request.OperationId, request.Count, actor.GetRequired()), cancellationToken);
}
