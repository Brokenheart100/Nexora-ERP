namespace Nexora.Finance.Application;

public sealed record ReportExportView(Guid Id, string Kind, long Watermark, DateTimeOffset RequestedAtUtc, DateTimeOffset? CompletedAtUtc);

public sealed record ReportExportFile(string Name, byte[] Bytes);
