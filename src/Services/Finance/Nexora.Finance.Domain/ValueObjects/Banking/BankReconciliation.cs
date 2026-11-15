namespace Nexora.Finance.Domain;

public sealed record ReconciliationMovement(Guid Id, Guid JournalId, DateOnly On, decimal Amount, bool Opening);

public sealed record ReconciliationLine(Guid Id, DateOnly On, string Reference, decimal Amount, bool Excluded);

public sealed record ReconciliationMatch(Guid Id, Guid MovementId, Guid LineId, decimal Amount);

public sealed record ReconciliationInput(decimal BookBalance, ReconciliationMovement[] Movements,
    ReconciliationLine[] Lines, ReconciliationMatch[] Matches);

public sealed record OutstandingBankItem(Guid Id, DateOnly On, string Reference, decimal Amount, Guid? JournalId);

public sealed record BankReconciliationSnapshot(DateOnly Through, decimal StatementBalance, decimal BookBalance,
    decimal OutstandingBooks, decimal OutstandingStatement, decimal AdjustedStatement, decimal Difference, decimal LedgerDifference,
    OutstandingBankItem[] Books, OutstandingBankItem[] Statement, Guid[] Matches)
{
    public static BankReconciliationSnapshot Calculate(DateOnly through, decimal ending, ReconciliationInput input)
    {
        var bookMatches = input.Matches.ToLookup(x => x.MovementId);
        var statementMatches = input.Matches.ToLookup(x => x.LineId);
        var books = input.Movements.Where(x => !x.Opening)
            .Select(x => new OutstandingBankItem(x.Id, x.On, "", Remainder(x.Amount, bookMatches[x.Id]), x.JournalId))
            .Where(x => x.Amount != 0).ToArray();
        var statement = input.Lines.Where(x => !x.Excluded)
            .Select(x => new OutstandingBankItem(x.Id, x.On, x.Reference, Remainder(x.Amount, statementMatches[x.Id]), null))
            .Where(x => x.Amount != 0).ToArray();
        var bookPending = books.Sum(x => x.Amount);
        var statementPending = statement.Sum(x => x.Amount);
        var adjusted = ending + bookPending - statementPending;
        return new(through, ending, input.BookBalance, bookPending, statementPending, adjusted, adjusted - input.BookBalance,
            input.BookBalance - input.Movements.Sum(x => x.Amount), books, statement, input.Matches.Select(x => x.Id).ToArray());
    }

    public bool HasSameEvidence(BankReconciliationSnapshot other) =>
        this with { Books = other.Books, Statement = other.Statement, Matches = other.Matches } == other
        && Books.SequenceEqual(other.Books) && Statement.SequenceEqual(other.Statement) && Matches.SequenceEqual(other.Matches);

    private static decimal Remainder(decimal amount, IEnumerable<ReconciliationMatch> matches) =>
        amount - Math.Sign(amount) * matches.Sum(x => x.Amount);
}
