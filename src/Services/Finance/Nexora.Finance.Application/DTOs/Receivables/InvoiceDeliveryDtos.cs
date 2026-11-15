namespace Nexora.Finance.Application;

public sealed record InvoicePdf(string FileName, byte[] Bytes);

public sealed record InvoiceShareView(Guid Id, DateTimeOffset ExpiresAtUtc, DateTimeOffset? RevokedAtUtc, string? Token = null);
