namespace Nexora.Finance.Domain;

public static class ChartRules
{
    public static IReadOnlyList<(string Code, string Error)> Validate(IReadOnlyDictionary<string, AccountDefinition> chart)
    {
        var errors = new List<(string Code, string Error)>();
        foreach (var account in chart.Values)
        {
            if (account.ParentCode is null) continue;
            if (!chart.TryGetValue(account.ParentCode, out var parent))
            {
                errors.Add((account.Code, $"上级科目 {account.ParentCode} 不存在。"));
                continue;
            }
            if (parent.Purpose != AccountPurpose.Group || parent.Category != account.Category)
                errors.Add((account.Code, "上级必须是同类别的分组科目。"));
            if (!account.IsArchived && parent.IsArchived)
                errors.Add((account.Code, "启用科目不能挂在已归档的上级下。"));
            var visited = new HashSet<string> { account.Code };
            var ancestor = parent;
            while (true)
            {
                if (!visited.Add(ancestor.Code))
                {
                    errors.Add((account.Code, "科目层级存在循环。"));
                    break;
                }
                if (ancestor.ParentCode is null || !chart.TryGetValue(ancestor.ParentCode, out var next)) break;
                ancestor = next;
            }
        }
        return errors;
    }
}
