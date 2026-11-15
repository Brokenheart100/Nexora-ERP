using Grpc.Core;
using Microsoft.AspNetCore.Http;
using Nexora.Organization.Contracts.Grpc;
using Nexora.Reporting.Application;
using Nexora.Reporting.Api;
using ProtoBuf.Grpc;

namespace Nexora.Tests;

public sealed class AuthorizationAvailabilityTests
{
    [Fact]
    public async Task Authority_connection_failure_never_falls_back_to_a_projection()
    {
        var context = new DefaultHttpContext();
        context.Request.Headers.Authorization = "Bearer synthetic-unit-token";
        var reader = new MustNotReadProjection();
        var result = await ProjectionEndpoints.Get(Guid.NewGuid(), context, new UnavailableAuthority(), reader, default);
        Assert.Equal(503, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.Equal(0, reader.Reads);
    }

    private sealed class UnavailableAuthority : IOrganizationGrpc
    {
        public Task<WorkspaceAccessReply> GetWorkspaceAccessAsync(WorkspaceAccessRequest request, CallContext context = default) => throw Unavailable();
        public Task<WorkspaceMembersReply> GetWorkspaceMembersAsync(WorkspaceMembersRequest request, CallContext context = default) => throw Unavailable();
        public Task<CompanySettingsReply> GetCompanySettingsAsync(CompanySettingsRequest request, CallContext context = default) => throw Unavailable();
        public Task<WorkspacePermissionReply> CheckWorkspacePermissionAsync(WorkspacePermissionRequest request, CallContext context = default) => throw Unavailable();
        private static RpcException Unavailable() =>
            new(new Status(StatusCode.Unavailable, "Simulated authorization authority connection failure"));
    }

    private sealed class MustNotReadProjection : IWorkspaceProjectionReader
    {
        public int Reads { get; private set; }
        public Task<WorkspaceProjection?> FindAsync(Guid id, CancellationToken cancellationToken)
        { Reads++; throw new InvalidOperationException("A projection must never authorize access when the authority is unavailable."); }
    }
}
