using Grpc.Core;
using Microsoft.AspNetCore.Http;
using Nexora.Organization.Contracts.Grpc;
using Nexora.Reporting.Api;
using Nexora.Reporting.Application;
using ProtoBuf.Grpc;

namespace Nexora.Tests;

public sealed class ProjectionEndpointTests
{
    [Theory]
    [InlineData(false, false, null, 404)]
    [InlineData(false, false, StatusCode.PermissionDenied, 404)]
    [InlineData(false, false, StatusCode.Unavailable, 503)]
    [InlineData(true, false, null, 202)]
    [InlineData(true, true, null, 200)]
    public async Task Projection_status_respects_authority_and_readiness(
        bool allowed, bool projected, StatusCode? authorityError, int expected)
    {
        var id = Guid.NewGuid();
        var context = new DefaultHttpContext();
        var reader = new ProjectionReader(projected);
        var result = await ProjectionEndpoints.Get(id, context, new Authority(allowed, authorityError), reader, default);

        Assert.Equal(expected, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.Equal(allowed, reader.WasCalled);
        if (expected == 202)
        {
            var accepted = Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Accepted<ProjectionEndpoints.ProjectionPending>>(result);
            Assert.Equal($"/api/reports/workspaces/{id}", accepted.Location);
            Assert.Equal("2", context.Response.Headers.RetryAfter.ToString());
        }
    }

    private sealed class ProjectionReader(bool projected) : IWorkspaceProjectionReader
    {
        public bool WasCalled { get; private set; }

        public Task<WorkspaceProjection?> FindAsync(Guid id, CancellationToken cancellationToken)
        {
            WasCalled = true;
            return Task.FromResult<WorkspaceProjection?>(projected
                ? new(id, Guid.NewGuid(), "Business", "CN", "CNY", 1, Guid.NewGuid(), DateTimeOffset.UtcNow)
                : null);
        }
    }

    private sealed class Authority(bool allowed, StatusCode? error) : IOrganizationGrpc
    {
        public Task<WorkspacePermissionReply> CheckWorkspacePermissionAsync(WorkspacePermissionRequest request, CallContext context = default) =>
            error is { } code
                ? Task.FromException<WorkspacePermissionReply>(new RpcException(new Status(code, "Test authority response")))
                : Task.FromResult(new WorkspacePermissionReply { Allowed = allowed });

        public Task<WorkspaceAccessReply> GetWorkspaceAccessAsync(WorkspaceAccessRequest request, CallContext context = default) => throw new NotSupportedException();

        public Task<WorkspaceMembersReply> GetWorkspaceMembersAsync(WorkspaceMembersRequest request, CallContext context = default) => throw new NotSupportedException();

        public Task<CompanySettingsReply> GetCompanySettingsAsync(CompanySettingsRequest request, CallContext context = default) => throw new NotSupportedException();
    }
}
