namespace Nexora.Finance.Domain;

public sealed record TaxAmount(Guid RateId, string Code, DateOnly EffectiveOn, decimal Rate, decimal Amount);

public sealed record TaxAmounts(decimal Net, decimal Tax, decimal Total, IReadOnlyList<TaxAmount> Components);
