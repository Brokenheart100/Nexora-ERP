using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using System.Text;
using Microsoft.Extensions.Configuration;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class SmtpInvoiceMail(IConfiguration configuration) : IInvoiceMail
{
    private sealed record Settings(string Host, int Port, MailAddress Sender, bool UseTls, string? Username, string? Password);

    public string ChannelStatus => ReadSettings() switch
    {
        null => "not-configured",
        { Host: var host } when IsLoopback(host) => "local-only",
        _ => "configured"
    };

    private Settings? ReadSettings()
    {
        var options = configuration.GetSection("InvoiceMail");
        var host = options["Host"];
        var username = options["Username"];
        var password = options["Password"];
        var ssl = !bool.TryParse(options["StartTls"], out var explicitTls) || explicitTls;
        if (string.IsNullOrWhiteSpace(host) || !int.TryParse(options["Port"], out var port) || port is < 1 or > 65535
            || !MailAddress.TryCreate(options["From"], out var sender)
            || !ssl && !IsLoopback(host)
            || !string.IsNullOrWhiteSpace(username) && string.IsNullOrWhiteSpace(password))
            return null;
        return new(host, port, sender, ssl, username, password);
    }

    private static bool IsLoopback(string host) => host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
        || IPAddress.TryParse(host, out var address) && IPAddress.IsLoopback(address);

    public async Task<DispatchOutcome> SendAsync(Guid id, int attempt, string recipient, CustomerTerms invoice, InvoicePdf pdf, CancellationToken ct)
    {
        if (ReadSettings() is not { } settings) return new(DispatchState.Failed, "The SMTP delivery channel is unavailable.");
        using var client = new SmtpClient(settings.Host, settings.Port) { EnableSsl = settings.UseTls, UseDefaultCredentials = false };
        if (!string.IsNullOrWhiteSpace(settings.Username)) client.Credentials = new NetworkCredential(settings.Username, settings.Password);
        using var message = new MailMessage(settings.Sender, new MailAddress(recipient))
        {
            Subject = $"客户发票 {invoice.Number}", SubjectEncoding = Encoding.UTF8,
            Body = $"您好，附件是发票 {invoice.Number}。", BodyEncoding = Encoding.UTF8
        };
        message.Headers.Add("X-Nexora-Dispatch", $"{id:N}/{attempt}");
        message.Attachments.Add(new Attachment(new MemoryStream(pdf.Bytes, writable: false), pdf.FileName, MediaTypeNames.Application.Pdf));
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        try
        {
            await client.SendMailAsync(message, timeout.Token);
            return new(DispatchState.Sent);
        }
        catch (SmtpException error) when ((int)error.StatusCode is >= 400 and <= 599)
        {
            return new(DispatchState.Failed, $"SMTP rejected delivery ({(int)error.StatusCode}).");
        }
        catch (Exception error) when (!ct.IsCancellationRequested && error is SmtpException or OperationCanceledException or IOException)
        {
            return new(DispatchState.Unknown, "The SMTP server did not confirm delivery.");
        }
    }
}
