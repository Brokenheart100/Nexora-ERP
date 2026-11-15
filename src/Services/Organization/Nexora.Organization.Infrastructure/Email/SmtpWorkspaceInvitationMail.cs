using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Nexora.Organization.Application;

namespace Nexora.Organization.Infrastructure;

internal sealed class SmtpWorkspaceInvitationMail(IConfiguration configuration) : IWorkspaceInvitationMail
{
    public async Task<string> SendAsync(InvitationCreatedResult invitation, CancellationToken cancellationToken)
    {
        var settings = configuration.GetSection("OnboardingMail");
        var host = settings["Host"];
        if (string.IsNullOrWhiteSpace(host) || !int.TryParse(settings["Port"], out var port) || port is < 1 or > 65535
            || !MailAddress.TryCreate(settings["From"], out var from)
            || !Uri.TryCreate(settings["PublicOrigin"], UriKind.Absolute, out var origin) || origin.Scheme != Uri.UriSchemeHttps)
            return "NotConfigured";

        var username = settings["Username"];
        var password = settings["Password"];
        var useTls = !bool.TryParse(settings["StartTls"], out var startTls) || startTls;
        if (!string.IsNullOrEmpty(username) && (!useTls || string.IsNullOrEmpty(password))) return "NotConfigured";

        using var client = new SmtpClient(host, port) { EnableSsl = useTls, UseDefaultCredentials = false };
        if (!string.IsNullOrEmpty(username)) client.Credentials = new NetworkCredential(username, password);
        var link = new Uri(origin, $"/join#{invitation.Invitation.Id}.{invitation.Token}");
        using var message = new MailMessage(from, new MailAddress(invitation.Invitation.Email))
        {
            Subject = "Nexora 工作区邀请",
            Body = $"你收到了 Nexora 工作区邀请。请使用受邀邮箱登录或注册后加入。\n\n{link.AbsoluteUri}",
        };
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        try
        {
            await client.SendMailAsync(message, timeout.Token);
            return "Sent";
        }
        catch (SmtpException error) when ((int)error.StatusCode is >= 400 and <= 599)
        {
            return "Failed";
        }
        catch (Exception error) when (!cancellationToken.IsCancellationRequested && error is SmtpException or OperationCanceledException or IOException)
        {
            return "Unknown";
        }
    }
}
