namespace Nexora.Finance.Application;

public sealed record ReadinessFacts(bool BookExists, string Opening, int PostedWithoutJournal, int PendingCosts);

public static class ReadinessPolicy
{
    public const string Pass = "pass";
    public const string Warn = "warn";
    public const string Fail = "fail";

    public static (ReadinessCheck[] Checks, bool Ready) Evaluate(ReadinessFacts facts)
    {
        var checks = new List<ReadinessCheck>();
        if (!facts.BookExists)
        {
            checks.Add(new("book.missing", Fail, 1,
                "Initialize the accounting book before enabling finance."));
            return (checks.ToArray(), false);
        }

        checks.Add(facts.Opening switch
        {
            "posted" => new ReadinessCheck("book.opening", Pass, 0, "Opening balances are posted."),
            "pending" => new ReadinessCheck("book.opening", Warn, 1,
                "Complete or cancel the pending opening balances before posting business documents."),
            _ => new ReadinessCheck("book.opening", Warn, 1,
                "Record opening balances so reports start from a complete position."),
        });
        checks.Add(facts.PostedWithoutJournal == 0
            ? new ReadinessCheck("documents.posted_without_journal", Pass, 0,
                "Every posted invoice and bill has a journal entry.")
            : new ReadinessCheck("documents.posted_without_journal", Fail, facts.PostedWithoutJournal,
                facts.PostedWithoutJournal == 1
                    ? "A posted invoice or bill has no journal entry. Correct it before enabling finance."
                    : "Posted invoices or bills have no journal entry. Correct them before enabling finance."));
        checks.Add(facts.PendingCosts == 0
            ? new ReadinessCheck("costs.pending_accrual", Pass, 0,
                "Every inventory cost fact is posted to the ledger.")
            : new ReadinessCheck("costs.pending_accrual", Fail, facts.PendingCosts,
                facts.PendingCosts == 1
                    ? "An inventory cost fact is not posted to the ledger. Backfill it before enabling finance."
                    : "Inventory cost facts are not posted to the ledger. Backfill them before enabling finance."));

        return (checks.ToArray(), checks.All(x => x.Severity != Fail));
    }
}
