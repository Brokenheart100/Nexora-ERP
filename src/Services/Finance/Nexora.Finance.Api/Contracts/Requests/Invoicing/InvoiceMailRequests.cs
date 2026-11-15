namespace Nexora.Finance.Api;

public static partial class InvoiceMailEndpoints
{
    public sealed record MailRequest(Guid OperationId, string Recipient);
    public sealed record MailDecision(Guid OperationId, long ExpectedVersion, string Decision);
}
