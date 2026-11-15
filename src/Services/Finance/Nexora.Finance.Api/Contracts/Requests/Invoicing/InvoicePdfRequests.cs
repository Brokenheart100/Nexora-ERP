namespace Nexora.Finance.Api;

public static partial class InvoicePdfEndpoints
{
    public sealed record ShareRequest(Guid OperationId, int LifetimeMinutes);
    public sealed record RevokeRequest(Guid OperationId);
    public sealed record SharedPdfRequest(string? Token);
}
