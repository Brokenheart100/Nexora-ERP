using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Finance.Application;
using Nexora.Organization.Contracts.Grpc;

namespace Nexora.Finance.Infrastructure;

public sealed class OrganizationBookAccess(IHttpContextAccessor accessor, IOrganizationGrpc organization) : IBookAccess
{
    public async Task<BookAccess> DemandAsync(Guid workspaceId, bool initialize, CancellationToken ct)
    {
        var http = accessor.HttpContext;
        var issuer = http?.User.FindFirstValue("iss");
        var subject = http?.User.FindFirstValue("sub");
        if (http?.User.Identity?.IsAuthenticated != true || string.IsNullOrWhiteSpace(issuer) || string.IsNullOrWhiteSpace(subject)
            || !AuthenticationHeaderValue.TryParse(http.Request.Headers.Authorization.ToString(), out var token)
            || !token.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(token.Parameter))
            throw new AccessDeniedException();

        var decision = await GrpcErrorMapper.CallAsync(
            () => organization.GetWorkspaceAccessAsync(
                new WorkspaceAccessRequest { WorkspaceId = workspaceId },
                GrpcCallContext.Forward(accessor, ct)),
            ct,
            _ => new BookAuthorityUnavailableException(),
            _ => new BookAuthorityUnavailableException());
        if (decision.WorkspaceId != workspaceId || decision.TenantId == Guid.Empty || decision.Permissions is null)
            throw new BookAuthorityUnavailableException();
        var canInitialize = decision.Permissions.Contains("organization.workspace.manage", StringComparer.Ordinal);
        if (!decision.Permissions.Contains("organization.workspace.read", StringComparer.Ordinal) || (initialize && !canInitialize))
            throw new AccessDeniedException();
        var scoped = (decision.ScopedPermissions ?? []).Select(permission => new ScopedPermission(permission.Permission,
            permission.DepartmentId == Guid.Empty ? null : permission.DepartmentId,
            permission.WarehouseId == Guid.Empty ? null : permission.WarehouseId,
            ParseDate(permission.StartsOn), ParseDate(permission.EndsOn))).ToArray();
        return new(new(decision.TenantId, workspaceId), new(issuer, subject), decision.IsPersonal, canInitialize,
            decision.Permissions, scoped);
    }

    private static DateOnly? ParseDate(string? value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : null;
}
