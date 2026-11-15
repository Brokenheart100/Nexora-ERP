namespace Nexora.Organization.Application;

public interface IWorkspaceInvitationMail
{
    Task<string> SendAsync(InvitationCreatedResult invitation, CancellationToken cancellationToken);
}
