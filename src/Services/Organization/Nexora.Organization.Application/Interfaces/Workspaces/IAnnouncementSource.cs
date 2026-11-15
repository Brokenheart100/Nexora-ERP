namespace Nexora.Organization.Application;

public interface IAnnouncementSource
{
    IReadOnlyList<Announcement> Read();
}
