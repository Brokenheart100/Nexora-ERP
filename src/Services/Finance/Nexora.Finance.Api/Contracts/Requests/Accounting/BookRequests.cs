namespace Nexora.Finance.Api;

public sealed record InitializeBookRequest(Guid OperationId, string BaseCurrency, DateOnly StartsOn, int FiscalYearStartMonth);
