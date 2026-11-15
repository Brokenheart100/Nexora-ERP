namespace Nexora.Finance.Application;

public interface IDonationReceiptRenderer
{
    Task<InvoicePdf> RenderAsync(DonationReceipt receipt, CancellationToken ct);
}
