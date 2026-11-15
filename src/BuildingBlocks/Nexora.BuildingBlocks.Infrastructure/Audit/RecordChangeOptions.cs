namespace Nexora.BuildingBlocks.Infrastructure;

public sealed class RecordChangeOptions
{
    public const string SectionName = "RecordChanges";

    public int RetentionDays { get; set; } = 730;
}
