namespace Nexora.Finance.Application;

public sealed record StarterAccountView(Guid Id, string Code, string Name, string Category);

public sealed record BookSettings(string BaseCurrency, int MinorUnits, DateOnly StartsOn, int FiscalYearStartMonth, string Template);

public sealed record BookView(bool IsPersonal, bool CanInitialize, BookSettings? Settings, IReadOnlyList<StarterAccountView> Accounts);
