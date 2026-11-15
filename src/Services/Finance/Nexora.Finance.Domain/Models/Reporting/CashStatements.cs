namespace Nexora.Finance.Domain;

public sealed record PostedSource(Guid JournalId, long Number, DateOnly On, string SourceNumber, string Memo, JournalKind Kind, CashActivity? CashActivity = null);

public sealed record CashJournalLine(PostedSource Source, Guid AccountId, string Code, string Name, AccountCategory Category,
    decimal Debit, decimal Credit, bool Cash)
{
    public decimal Signed => Debit - Credit;
}

public sealed record PostedCustomer(Guid Id, CustomerTerms Terms, PostedSource Source, decimal ReceivableDelta);

public sealed record PostedTrade(Guid Id, TradeTerms Terms, PostedSource Source, decimal Total, decimal Recovery, decimal TaxCredit);

public sealed record FinanceHistory(CashJournalLine[] CashLines, PostedCustomer[] Customers, PostedTrade[] Trades);

public sealed record CashContribution(string Key, string Name, string Section, PostedSource Source, decimal Amount,
    Guid? AccountId = null, string Code = "", decimal Debit = 0, decimal Credit = 0);

public sealed record CashStatement(AccrualStatement Statement, CashContribution[] Contributions);
