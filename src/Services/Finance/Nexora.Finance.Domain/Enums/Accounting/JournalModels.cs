namespace Nexora.Finance.Domain;

public enum CashActivity { Operating = 1, Investing, Financing }

public enum JournalState { Draft = 1, Submitted, Posted, Cancelled }

public enum JournalKind { Opening = 1, Manual, Reversal, Automatic, FiscalClosing }
