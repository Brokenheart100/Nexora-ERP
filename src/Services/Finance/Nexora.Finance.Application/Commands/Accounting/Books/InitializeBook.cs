namespace Nexora.Finance.Application;

public sealed record InitializeBook(Guid WorkspaceId, Guid OperationId, string BaseCurrency, DateOnly StartsOn, int FiscalYearStartMonth);
