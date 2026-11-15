namespace Nexora.Organization.Application;

public sealed record PersonalLinkView(Guid PersonalWorkspaceId, Guid CompanyWorkspaceId, bool IsLinked);
