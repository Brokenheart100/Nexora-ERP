using Grpc.Core;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Organization.Contracts.Grpc;
using Nexora.Reporting.Application;
using Nexora.ServiceDefaults.Http;
using Wolverine.Http;

namespace Nexora.Reporting.Api;

public static class ProjectionEndpoints
{
    [Authorize, WolverineGet("/api/reports/workspaces/{id:guid}")]
    [ProducesResponseType<WorkspaceProjection>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProjectionPending>(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable, "application/problem+json")]
    public static async Task<IResult> Get(Guid id, HttpContext context, IOrganizationGrpc organization,
        IWorkspaceProjectionReader reader, CancellationToken cancellationToken)
    {
        // Projection possession is not authorization. Re-check the authoritative owner service.
        WorkspacePermissionReply decision;
        try
        {
            decision = await organization.CheckWorkspacePermissionAsync(
                new WorkspacePermissionRequest { WorkspaceId = id, Permission = "reports.workspace.read" },
                GrpcCallContext.Forward(context, cancellationToken));
        }
        catch (RpcException error) when (!cancellationToken.IsCancellationRequested)
        {
            return error.StatusCode is StatusCode.PermissionDenied or StatusCode.NotFound
                ? ApiProblems.Create(context, 404)
                : ApiProblems.Create(context, 503, "reports.authority_unavailable", title: "Authorization authority unavailable");
        }

        if (!decision.Allowed) return ApiProblems.Create(context, 404);
        var projection = await reader.FindAsync(id, cancellationToken);
        if (projection is not null) return Results.Ok(projection);
        context.Response.Headers.RetryAfter = "2";
        return Results.Accepted($"/api/reports/workspaces/{id}", new ProjectionPending("pending"));
    }

    public sealed record ProjectionPending(string Status);
}
