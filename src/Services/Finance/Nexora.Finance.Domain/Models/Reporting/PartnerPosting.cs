namespace Nexora.Finance.Domain;

public sealed record PartnerPosting(Guid DocumentId, string Kind, PostedSource Source, Guid? RelatedDocumentId,
    decimal OpenDelta, decimal FundsDelta);
