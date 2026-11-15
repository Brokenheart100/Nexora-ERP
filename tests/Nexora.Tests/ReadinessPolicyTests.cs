using Nexora.Finance.Application;

namespace Nexora.Tests;

public sealed class ReadinessPolicyTests
{
    [Fact]
    public void Missing_book_blocks_readiness_with_a_single_check()
    {
        var (checks, ready) = ReadinessPolicy.Evaluate(new ReadinessFacts(false, "none", 0, 0));

        Assert.False(ready);
        var check = Assert.Single(checks);
        Assert.Equal("book.missing", check.Code);
        Assert.Equal(ReadinessPolicy.Fail, check.Severity);
        Assert.Equal(1, check.Count);
    }

    [Fact]
    public void Missing_opening_balances_warn_without_blocking()
    {
        var (checks, ready) = ReadinessPolicy.Evaluate(new ReadinessFacts(true, "missing", 0, 0));

        Assert.True(ready);
        Assert.Equal(3, checks.Length);
        Assert.Equal(ReadinessPolicy.Warn, checks[0].Severity);
        Assert.Equal("book.opening", checks[0].Code);
        Assert.All(checks.Skip(1), x => Assert.Equal(ReadinessPolicy.Pass, x.Severity));
    }

    [Fact]
    public void Pending_opening_balances_warn_with_the_completion_hint()
    {
        var (checks, _) = ReadinessPolicy.Evaluate(new ReadinessFacts(true, "pending", 0, 0));

        Assert.Equal(ReadinessPolicy.Warn, checks[0].Severity);
        Assert.Contains("Complete or cancel", checks[0].Message);
    }

    [Fact]
    public void Posted_documents_without_a_journal_block_readiness()
    {
        var (checks, ready) = ReadinessPolicy.Evaluate(new ReadinessFacts(true, "posted", 2, 0));

        Assert.False(ready);
        var check = Assert.Single(checks, x => x.Code == "documents.posted_without_journal");
        Assert.Equal(ReadinessPolicy.Fail, check.Severity);
        Assert.Equal(2, check.Count);
        Assert.Contains("no journal entry", check.Message);
    }

    [Fact]
    public void Pending_cost_facts_block_readiness_with_the_backfill_hint()
    {
        var (checks, ready) = ReadinessPolicy.Evaluate(new ReadinessFacts(true, "posted", 0, 1));

        Assert.False(ready);
        var check = Assert.Single(checks, x => x.Code == "costs.pending_accrual");
        Assert.Equal(ReadinessPolicy.Fail, check.Severity);
        Assert.Contains("Backfill it", check.Message);
    }

    [Fact]
    public void Complete_book_with_posted_entries_is_ready()
    {
        var (checks, ready) = ReadinessPolicy.Evaluate(new ReadinessFacts(true, "posted", 0, 0));

        Assert.True(ready);
        Assert.All(checks, x => Assert.Equal(ReadinessPolicy.Pass, x.Severity));
        Assert.Equal(3, checks.Length);
    }
}
