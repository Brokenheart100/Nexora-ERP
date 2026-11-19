namespace Nexora.Finance.Domain;

public sealed record PartnerCapital(string Code, string Name, Guid CapitalAccountId, Guid DrawingsAccountId, decimal Share);

public sealed class PartnershipYear
{
    private PartnershipYear() { }

    public PartnershipYear(AccountingBook book, int year)
    {
        TenantId = book.TenantId;
        WorkspaceId = book.WorkspaceId;
        Year = year;
    }

    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public int Year { get; private set; }
    public long Version { get; private set; }
    public PartnerCapital[] Partners { get; private set; } = [];

    public void Change(PartnerCapital[] input)
    {
        if (input is not { Length: >= 2 and <= 40 } || input.Any(x => x is null))
            throw new ArgumentException("Choose between two and forty partners.");
        var partners = input.Select(x => x with { Code = x.Code?.Trim().ToUpperInvariant() ?? "", Name = x.Name?.Trim() ?? "" })
            .OrderBy(x => x.Code, StringComparer.Ordinal).ToArray();
        if (partners.Select(x => x.Code).Distinct().Count() != partners.Length
            || partners.Any(x => x.Code.Length is < 1 or > 24 || x.Name.Length is < 1 or > 100
                || x.Share is <= 0 or >= 1 || Math.Round(x.Share, 6) != x.Share)
            || partners.Sum(x => x.Share) != 1
            || partners.SelectMany(x => new[] { x.CapitalAccountId, x.DrawingsAccountId }).Distinct().Count() != 2 * partners.Length)
            throw new ArgumentException("Partner codes and accounts must be distinct and shares must total 100%.");
        Partners = partners;
        Version++;
    }

    public decimal[] Allocate(decimal profit, int minorUnits)
    {
        decimal cumulative = 0, previous = 0;
        return Partners.Select(partner =>
        {
            cumulative += partner.Share;
            var amount = Math.Round(profit * cumulative, minorUnits, MidpointRounding.AwayFromZero);
            var share = amount - previous;
            previous = amount;
            return share;
        }).ToArray();
    }
}
