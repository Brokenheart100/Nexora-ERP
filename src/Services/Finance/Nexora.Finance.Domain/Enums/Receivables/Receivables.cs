namespace Nexora.Finance.Domain;

public enum CustomerDocumentKind { Invoice = 1, Receipt, Allocation, Credit, Refund }

public enum CustomerDocumentState { Submitted = 1, Posted, Cancelled }
