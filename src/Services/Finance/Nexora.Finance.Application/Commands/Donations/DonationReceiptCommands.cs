namespace Nexora.Finance.Application;

public sealed record LinkDonationFiscalTicket(Guid WorkspaceId, Guid DonationId, Guid OperationId,
    string Code, string Number, DateOnly IssuedOn);

public sealed record QueueDonationReceiptMail(Guid WorkspaceId, Guid DonationId, Guid OperationId, string Recipient);

public sealed record DecideDonationReceiptMail(Guid WorkspaceId, Guid DonationId, Guid DispatchId, Guid OperationId,
    long ExpectedVersion, string Decision);
