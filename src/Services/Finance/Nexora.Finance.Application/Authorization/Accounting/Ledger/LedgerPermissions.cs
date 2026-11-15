namespace Nexora.Finance.Application;

public static class LedgerPermissions
{
    public const string Read = "finance.ledger.read";
    public const string Draft = "finance.journal.create";
    public const string Post = "finance.journal.post";
    public const string Reverse = "finance.journal.reverse";
    public const string Period = "finance.period.manage";
}
