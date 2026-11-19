namespace Nexora.Finance.Application;

public interface IFinancialReportPdf
{
    Task<InvoicePdf> RenderAsync(FinancialReport report, CancellationToken ct);
}
