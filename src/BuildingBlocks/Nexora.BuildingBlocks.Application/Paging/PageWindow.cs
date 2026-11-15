namespace Nexora.BuildingBlocks.Application;

public readonly record struct PageWindow
{
    public const int DefaultSize = 50;
    public const int MaximumSize = 100;

    public PageWindow(int page, int size)
    {
        if (page is < 1 or > 100_000 || size is < 1 or > MaximumSize)
            throw new ArgumentException("Page must be between 1 and 100000 and pageSize between 1 and 100.");
        Size = size;
        Offset = (page - 1) * size;
    }

    public int Size { get; }
    public int Offset { get; }

    public static PageWindow? Optional(int? page, int? size) =>
        page is null && size is null ? null : new PageWindow(page ?? 1, size ?? DefaultSize);
}
