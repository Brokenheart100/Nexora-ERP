namespace Nexora.Finance.Domain;

public sealed class DonationFiscalTicket
{
    private DonationFiscalTicket() { }

    public DonationFiscalTicket(TradeDocument donation, string code, string number, DateOnly issuedOn, DateTimeOffset linkedAtUtc)
    {
        if (donation is not { State: TradeState.Posted, Terms.Kind: TradeKind.Donation, ReversedById: null })
            throw new LedgerRuleException("An active posted donation is required to link a fiscal ticket.");
        if (issuedOn < donation.Terms.On)
            throw new ArgumentException("The ticket issue date cannot precede the donation.");

        Id = Guid.CreateVersion7();
        TenantId = donation.TenantId;
        WorkspaceId = donation.WorkspaceId;
        DonationId = donation.Id;
        Code = NormalizeIdentifier(code);
        Number = NormalizeIdentifier(number);
        IssuedOn = issuedOn;
        // Keep the timestamp identical when the creation response is replayed from storage.
        LinkedAtUtc = linkedAtUtc.AddTicks(-(linkedAtUtc.Ticks % TimeSpan.TicksPerMicrosecond));
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid DonationId { get; private set; }
    public string Code { get; private set; } = "";
    public string Number { get; private set; } = "";
    public DateOnly IssuedOn { get; private set; }
    public DateTimeOffset LinkedAtUtc { get; private set; }

    private static string NormalizeIdentifier(string? value)
    {
        var text = value?.Trim().ToUpperInvariant() ?? "";
        if (text.Length is < 1 or > 40 || text.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-')
            || !text.Any(char.IsAsciiLetterOrDigit))
            throw new ArgumentException("Enter the code and number shown on the issued fiscal ticket.");
        return text;
    }
}
