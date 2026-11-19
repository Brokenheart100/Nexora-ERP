using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Organization.Api;

public static class CompanySettingsEndpoints
{
    [Authorize, WolverineGet("/api/workspaces/{id:guid}/settings")]
    public static Task<CompanySettingsView> Get(Guid id, CompanySettingsUseCases useCases, ICurrentActor actor, CancellationToken ct) =>
        useCases.GetAsync(id, actor.GetRequired(), ct);

    [ApiWrite("expectedVersion", idempotent: false)]
    [Authorize, WolverinePut("/api/workspaces/{id:guid}/settings")]
    public static Task<CompanySettingsView> Update(Guid id, ReviseCompanySettingsRequest request,
        ICurrentActor actor, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<CompanySettingsView>(new ReviseCompanySettings(id, request.ExpectedVersion!.Value,
            request.Presentation, request.SessionIdleMinutes, request.RoleGrantApprovals, actor.GetRequired()), ct);
}
