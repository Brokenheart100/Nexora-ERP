namespace Nexora.Finance.Api;

public static partial class ReportExportEndpoints
{
    public sealed record ExportRequest(Guid OperationId, string Kind, DateOnly From, DateOnly Through, bool Compare, long Watermark, string? Basis);
    public sealed record RebuildRequest(Guid OperationId);
}
