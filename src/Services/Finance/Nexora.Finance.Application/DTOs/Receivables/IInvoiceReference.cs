namespace Nexora.Finance.Application;

public sealed record InvoiceCustomer(Guid Id, string Name, string[] Emails);

public sealed record ServiceReference(Guid Id, string Name);
