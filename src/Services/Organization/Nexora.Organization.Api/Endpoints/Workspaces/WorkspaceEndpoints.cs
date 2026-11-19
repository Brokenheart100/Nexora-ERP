using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Organization.Api;

public static class WorkspaceEndpoints
{
    [ApiWrite]
    [Authorize, WolverinePost("/api/workspaces")]
    public static async Task<IResult> Open(CreateWorkspaceRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken cancellationToken)
    {
        var result = await bus.InvokeAsync<OpenWorkspaceResult>(new OpenWorkspace(request.OperationId, request.Name, actor.GetRequired()), cancellationToken);
        return result.Created ? Results.Created($"/api/workspaces/{result.Workspace.Id}", result.Workspace) : Results.Ok(result.Workspace);
    }

    [Authorize, WolverineGet("/api/account/deletion-preflight")]
    public static Task<AccountDeletionReview> Preflight(AccountDeletionPreflight queries, ICurrentActor actor, CancellationToken ct) =>
        queries.ReadAsync(actor.GetRequired(), ct);

    [Authorize(Policy = "cli"), WolverineGet("/api/cli/workspaces")]
    public static Task<IReadOnlyList<WorkspaceView>> ListForCli(WorkspaceQueries queries, ICurrentActor actor, CancellationToken cancellationToken) =>
        queries.ListAsync(actor.GetRequired(), cancellationToken);

    [Authorize, WolverineGet("/api/workspaces")]
    public static Task<IReadOnlyList<WorkspaceView>> List(WorkspaceQueries queries, ICurrentActor actor, CancellationToken cancellationToken) =>
        queries.ListAsync(actor.GetRequired(), cancellationToken);

    [ApiWrite]
    [Authorize, WolverinePost("/api/workspaces/personal")]
    public static async Task<IResult> OpenPersonal(CreateWorkspaceRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<OpenWorkspaceResult>(new OpenWorkspace(request.OperationId, request.Name,
            actor.GetRequired(), IsPersonal: true), ct);
        return result.Created ? Results.Created($"/api/workspaces/{result.Workspace.Id}", result.Workspace) : Results.Ok(result.Workspace);
    }

    [Authorize, WolverineGet("/api/workspaces/{id:guid}")]
    public static Task<WorkspaceView> Get(Guid id, WorkspaceQueries queries, ICurrentActor actor, CancellationToken cancellationToken) =>
        queries.GetAsync(id, actor.GetRequired(), cancellationToken);
}
