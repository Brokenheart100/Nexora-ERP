using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Nexora.Organization.Contracts.Grpc;

namespace Nexora.Organization.Api.Grpc;

// Ordinary Wolverine handlers behind the generated code-first gRPC service.
public static class OrganizationGrpcHandler
{
    public static async Task<WorkspaceAccessReply> Handle(WorkspaceAccessRequest request,
        GovernanceUseCases governance, ICurrentActor currentActor, CancellationToken cancellationToken)
    {
        var access = await governance.AccessAsync(request.WorkspaceId, currentActor.GetRequired(), cancellationToken);
        return new WorkspaceAccessReply
        {
            WorkspaceId = access.WorkspaceId,
            TenantId = access.TenantId,
            Role = access.Role,
            IsPersonal = access.IsPersonal,
            MemberId = access.MemberId,
            Permissions = access.Permissions.ToArray(),
            ScopedPermissions = (access.ScopedPermissions ?? []).Select(permission => new ScopedPermissionData
            {
                Permission = permission.Permission,
                DepartmentId = permission.DepartmentId ?? Guid.Empty,
                WarehouseId = permission.WarehouseId ?? Guid.Empty,
                StartsOn = permission.StartsOn?.ToString("yyyy-MM-dd"),
                EndsOn = permission.EndsOn?.ToString("yyyy-MM-dd")
            }).ToArray(),
            DepartmentIds = access.DepartmentIds ?? []
        };
    }

    public static async Task<WorkspaceMembersReply> Handle(WorkspaceMembersRequest request,
        GovernanceUseCases governance, ICurrentActor currentActor, CancellationToken cancellationToken)
    {
        var members = await governance.MembersAsync(request.WorkspaceId, currentActor.GetRequired(), cancellationToken);
        return new WorkspaceMembersReply
        {
            Members = members.Select(member => new MemberData { Id = member.Id, IsActive = member.IsActive }).ToArray()
        };
    }

    public static async Task<WorkspacePermissionReply> Handle(WorkspacePermissionRequest request,
        GovernanceUseCases governance, IApplicationAuthorization authorization, ICurrentActor currentActor, CancellationToken cancellationToken)
    {
        var current = currentActor.GetRequired();
        var access = await governance.AccessAsync(request.WorkspaceId, current, cancellationToken);
        var decision = await authorization.CheckAsync(current, new ResourceScope(access.TenantId, request.WorkspaceId), request.Permission, cancellationToken);
        return new WorkspacePermissionReply { Allowed = decision.Allowed };
    }

    public static async Task<CompanySettingsReply> Handle(CompanySettingsRequest request,
        CompanySettingsUseCases companySettings, ICurrentActor currentActor, CancellationToken cancellationToken)
    {
        var settings = await companySettings.GetAsync(request.WorkspaceId, currentActor.GetRequired(), cancellationToken);
        return new CompanySettingsReply
        {
            WorkspaceId = settings.WorkspaceId,
            BaseCurrency = settings.BaseCurrency,
            Version = settings.Version,
            CanManage = settings.CanManage,
            LegalName = settings.Presentation.LegalName,
            BrandName = settings.Presentation.BrandName,
            AccentColor = settings.Presentation.AccentColor,
            LogoDataUrl = settings.Presentation.LogoDataUrl,
            DateFormat = settings.Presentation.DateFormat,
            TimeZone = settings.Presentation.TimeZone
        };
    }
}
