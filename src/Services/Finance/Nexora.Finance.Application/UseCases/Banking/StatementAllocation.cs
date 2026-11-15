using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class StatementAllocation(IStatementStore statements, ITradeStore trade, BankCutoff cutoff, TradePosting posting)
{
    public async Task<StatementMatch> AttachAsync(ResourceScope scope, AccountingBook book, Guid referenceId, Guid lineId, BankMovement movement,
        decimal amount, CancellationToken ct, bool requireSameDate = false)
    {
        var line = await statements.LineAsync(scope, lineId, ct) ?? throw new ResourceNotFoundException();
        if (line.BankId != movement.BankId || Math.Sign(line.Amount) != Math.Sign(movement.Amount) || requireSameDate && line.On != movement.On)
            throw new LedgerRuleException("Bank account, direction or posting date differs from the statement line.");
        await DemandMatchDateAsync(scope, book, line, movement, ct);
        line.Match(amount);
        movement.Match(amount);
        var match = new StatementMatch(line, movement, referenceId, amount);
        statements.Add(match);
        return match;
    }

    public async Task ReleaseAsync(ResourceScope scope, AccountingBook book, StatementMatch match, CancellationToken ct)
    {
        var line = await statements.LineAsync(scope, match.StatementLineId, ct) ?? throw new ResourceNotFoundException();
        var movement = await trade.MovementAsync(scope, match.MovementId, ct) ?? throw new ResourceNotFoundException();
        await DemandMatchDateAsync(scope, book, line, movement, ct);
        match.Reverse();
        line.Unmatch(match.Amount);
        movement.Unmatch(match.Amount);
    }

    private async Task DemandMatchDateAsync(ResourceScope scope, AccountingBook book, StatementLine line, BankMovement movement, CancellationToken ct)
    {
        // A match first affects reconciliation when both sides are in the cutoff.
        var effective = line.On > movement.On ? line.On : movement.On;
        var gate = await posting.GateAsync(scope, book, effective, ct);
        if (gate is not null) throw new LedgerRuleException(gate);
        await cutoff.DemandOpenAsync(scope, line.BankId, effective, ct);
    }
}
