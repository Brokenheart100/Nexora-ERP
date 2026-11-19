namespace Nexora.Finance.Api;

public static partial class DonationReceiptEndpoints
{
    public sealed record DonationFiscalTicketRequest(Guid OperationId, string Code, string Number, DateOnly IssuedOn);
    public sealed record DonationReceiptMailRequest(Guid OperationId, string Recipient);
    public sealed record DonationReceiptMailDecision(Guid OperationId, long ExpectedVersion, string Decision);
}
