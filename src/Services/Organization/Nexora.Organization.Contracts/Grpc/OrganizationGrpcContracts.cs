using System.Runtime.Serialization;
using System.ServiceModel;
using ProtoBuf.Grpc;

namespace Nexora.Organization.Contracts.Grpc;

// Code-first gRPC surface for the Organization owner service. Messages carry wire-friendly
// primitives only; Application/Domain/EF types never cross this boundary.
[ServiceContract]
public interface IOrganizationGrpc
{
    Task<WorkspaceAccessReply> GetWorkspaceAccessAsync(WorkspaceAccessRequest request, CallContext context = default);
    Task<WorkspaceMembersReply> GetWorkspaceMembersAsync(WorkspaceMembersRequest request, CallContext context = default);
    Task<CompanySettingsReply> GetCompanySettingsAsync(CompanySettingsRequest request, CallContext context = default);
    Task<WorkspacePermissionReply> CheckWorkspacePermissionAsync(WorkspacePermissionRequest request, CallContext context = default);
}

[DataContract]
public sealed class WorkspaceAccessRequest
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
}

[DataContract]
public sealed class ScopedPermissionData
{
    [DataMember(Order = 1)] public string Permission { get; set; } = string.Empty;

    // Guid.Empty means "not scoped" because protobuf-net 2.x avoids nullable value types.
    [DataMember(Order = 2)] public Guid DepartmentId { get; set; }
    [DataMember(Order = 3)] public Guid WarehouseId { get; set; }
    [DataMember(Order = 4)] public string? StartsOn { get; set; }
    [DataMember(Order = 5)] public string? EndsOn { get; set; }
}

[DataContract]
public sealed class WorkspaceAccessReply
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
    [DataMember(Order = 2)] public Guid TenantId { get; set; }
    [DataMember(Order = 3)] public string Role { get; set; } = string.Empty;
    [DataMember(Order = 4)] public bool IsPersonal { get; set; }
    [DataMember(Order = 5)] public Guid MemberId { get; set; }
    [DataMember(Order = 6)] public string[] Permissions { get; set; } = [];
    [DataMember(Order = 7)] public ScopedPermissionData[] ScopedPermissions { get; set; } = [];
    [DataMember(Order = 8)] public Guid[] DepartmentIds { get; set; } = [];
}

[DataContract]
public sealed class WorkspaceMembersRequest
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
}

[DataContract]
public sealed class MemberData
{
    [DataMember(Order = 1)] public Guid Id { get; set; }
    [DataMember(Order = 2)] public bool IsActive { get; set; }
}

[DataContract]
public sealed class WorkspaceMembersReply
{
    [DataMember(Order = 1)] public MemberData[] Members { get; set; } = [];
}

[DataContract]
public sealed class WorkspacePermissionRequest
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
    [DataMember(Order = 2)] public string Permission { get; set; } = string.Empty;
}

[DataContract]
public sealed class WorkspacePermissionReply
{
    [DataMember(Order = 1)] public bool Allowed { get; set; }
}

[DataContract]
public sealed class CompanySettingsRequest
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
}

[DataContract]
public sealed class CompanySettingsReply
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
    [DataMember(Order = 2)] public string BaseCurrency { get; set; } = string.Empty;
    [DataMember(Order = 3)] public long Version { get; set; }
    [DataMember(Order = 4)] public bool CanManage { get; set; }
    [DataMember(Order = 5)] public string LegalName { get; set; } = string.Empty;
    [DataMember(Order = 6)] public string BrandName { get; set; } = string.Empty;
    [DataMember(Order = 7)] public string AccentColor { get; set; } = string.Empty;
    [DataMember(Order = 8)] public string? LogoDataUrl { get; set; }
    [DataMember(Order = 9)] public string DateFormat { get; set; } = string.Empty;
    [DataMember(Order = 10)] public string TimeZone { get; set; } = string.Empty;
}
