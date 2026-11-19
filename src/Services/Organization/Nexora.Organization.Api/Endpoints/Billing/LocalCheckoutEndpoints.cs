using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;
using Nexora.ServiceDefaults.Http;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Organization.Api;

public static class LocalCheckoutEndpoints
{
    private const string Root = "/api/workspaces/{id:guid}/billing/local-checkout";

    [RequireWorkspacePermission(WorkspacePermissions.BillingManage), WolverineGet(Root)]
    public static Task<LocalCheckoutState> Read(Guid id, IHostEnvironment environment, BillingUseCases useCases,
        ILocalCheckoutTicket ticket, ICurrentActor actor, HttpContext http, CancellationToken ct)
    {
        DemandLocal(environment, http);
        return useCases.LocalCheckoutAsync(id, actor.GetRequired(), ticket, ct);
    }

    [RequireWorkspacePermission(WorkspacePermissions.BillingManage), ApiWrite, WolverinePost(Root)]
    public static Task<LocalCheckoutIntent> Start(Guid id, StartCheckoutRequest request, IHostEnvironment environment,
        HttpContext http, ICurrentActor actor, IMessageBus bus, CancellationToken ct)
    {
        DemandLocal(environment, http);
        return bus.InvokeAsync<LocalCheckoutIntent>(
            new BeginLocalCheckout(id, request.OperationId, request.PlanCode, request.ExpectedAmountCents, request.UseSavedCard, actor.GetRequired()), ct);
    }

    [RequireWorkspacePermission(WorkspacePermissions.BillingManage), WolverinePost(Root + "/{invoiceId:guid}/callback")]
    public static Task<BillingView> Confirm(Guid id, Guid invoiceId, ConfirmCheckoutRequest request, IHostEnvironment environment,
        HttpContext http, ICurrentActor actor, IMessageBus bus, CancellationToken ct)
    {
        DemandLocal(environment, http);
        return bus.InvokeAsync<BillingView>(
            new ConfirmLocalCheckout(id, invoiceId, request.Ticket, request.SaveCard, actor.GetRequired()), ct);
    }

    private static void DemandLocal(IHostEnvironment environment, HttpContext http)
    {
        if (!environment.IsDevelopment()) throw new ResourceNotFoundException();
        http.Response.Headers.CacheControl = "no-store";
    }

    public sealed record StartCheckoutRequest(Guid OperationId, string PlanCode, int ExpectedAmountCents, bool UseSavedCard);
    public sealed record ConfirmCheckoutRequest(string Ticket, bool SaveCard);
}
