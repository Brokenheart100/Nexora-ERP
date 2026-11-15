"""Validate P0 document coverage and specification arithmetic, not application behavior."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
CENT = Decimal("0.01")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def validate() -> dict:
    plan = (DOCS / "计划.md").read_text(encoding="utf-8")
    expected = [f"F{i:02d}" for i in range(1, 43)]
    features = re.findall(r"^\| (F\d{2}) \|", plan, re.M)
    require(features == expected, "F01-F42 matrix missing, duplicated or out of order")
    todos = re.findall(r"^- \[[ xX]\] (F\d{2}) ", plan, re.M)
    require(todos == expected, "Feature acceptance TODO does not match matrix")
    cases = (DOCS / "domain/p0-use-cases.md").read_text(encoding="utf-8")
    case_blocks = re.findall(r"^### UC-(F\d{2}) — (.*?)(?=^### |\Z)", cases, re.M | re.S)
    require([x[0] for x in case_blocks] == expected, "Use case coverage incomplete")
    for fid, block in case_blocks:
        for label in ["归属 / 来源", "页面", "API / 入口", "前置与授权", "主流程", "异常 / 竞态", "最低验收"]:
            require(f"**{label}**" in block, f"{fid} missing {label}")
    adrs = sorted((DOCS / "adr").glob("[0-9][0-9][0-9][0-9]-*.md"))
    require([p.name[:4] for p in adrs] == [f"{i:04d}" for i in range(1, 17)], "ADR 0001-0016 incomplete")
    for adr in adrs:
        text = adr.read_text(encoding="utf-8")
        for heading in ["## 背景", "## 决策", "## 比较与取舍", "## 影响与约束", "## 验证与未决条件"]:
            require(heading in text, f"{adr.name} missing {heading}")

    link_count = 0
    files = sorted(DOCS.rglob("*.md"))
    for path in files:
        text = path.read_text(encoding="utf-8")
        require("\ufffd" not in text, f"Replacement character in {path}")
        in_code = False
        columns = None
        for n, line in enumerate(text.splitlines(), 1):
            if line.startswith("```"):
                in_code = not in_code
                columns = None
                continue
            if in_code:
                continue
            if line.startswith("|"):
                count = line.count("|") - 1
                require(columns is None or count == columns, f"Bad table: {path}:{n}")
                columns = count
            else:
                columns = None
        require(not in_code, f"Unclosed code block: {path}")
        for link in re.findall(r"\]\(([^)]+)\)", text):
            if link.startswith(("https://", "http://", "mailto:")):
                continue
            target, _, fragment = link.partition("#")
            destination = (path.parent / unquote(target)).resolve() if target else path
            require(destination.is_file(), f"Broken local link: {path.name}: {link}")
            link_count += 1
            if fragment and destination.name == "p0-use-cases.md":
                require(f'id="{fragment}"' in destination.read_text(encoding="utf-8"), f"Missing case anchor: {fragment}")

    fixtures = json.loads((DOCS / "domain/p0-accounting-fixtures.json").read_text(encoding="utf-8"))
    for row in fixtures["roundingExamples"]:
        require(money(Decimal(row["input"])) == Decimal(row["expected"]), "Rounding sample mismatch")
    ex = {k: Decimal(v) for k, v in fixtures["taxExclusive"].items()}
    net = money(ex["unitPrice"] * ex["quantity"] * (1 - ex["discountRate"]))
    tax = money(net * ex["sampleTaxRate"])
    require((net, tax, net + tax) == (ex["expectedNet"], ex["expectedTax"], ex["expectedGross"]), "Exclusive tax sample mismatch")
    inc = {k: Decimal(v) for k, v in fixtures["taxInclusive"].items()}
    inc_net = money(inc["gross"] / (1 + inc["sampleTaxRate"]))
    require((inc_net, inc["gross"] - inc_net) == (inc["expectedNet"], inc["expectedTax"]), "Inclusive tax sample mismatch")
    cost = {k: Decimal(v) for k, v in fixtures["costing"].items()}
    total_q = cost["openingQuantity"] + cost["receiptQuantity"]
    total_v = cost["openingValue"] + cost["receiptValue"]
    average = total_v / total_q
    issue = money(average * cost["issueQuantity"])
    remaining_q = total_q - cost["issueQuantity"]
    require(average == cost["expectedAverage"] and issue == cost["expectedIssueCost"], "Cost sample mismatch")
    require((remaining_q, total_v - issue, remaining_q - cost["reservationQuantity"]) == (cost["expectedRemainingQuantity"], cost["expectedRemainingValue"], cost["expectedAvailable"]), "Stock conservation mismatch")
    for key in ["payable", "receivable"]:
        row = fixtures[key]
        require(Decimal(row["initial"]) - Decimal(row["allocated"]) == Decimal(row["expectedOpen"]), f"{key} open balance mismatch")
    ar = {k: Decimal(v) for k, v in fixtures["receivable"].items()}
    cash_net = money(ar["net"] * ar["allocated"] / ar["initial"])
    require((cash_net, ar["allocated"] - cash_net) == (ar["expectedCashBasisNet"], ar["expectedCashBasisTax"]), "Cash basis allocation mismatch")
    require((ar["net"] - cash_net) + (ar["tax"] - (ar["allocated"] - cash_net)) == ar["expectedOpen"], "Last-allocation remainder mismatch")
    bank = fixtures["bank"]
    require(Decimal(bank["opening"]) + Decimal(bank["income"]) - Decimal(bank["expense"]) == Decimal(bank["expectedClosing"]), "Bank closing mismatch")
    require(sum(map(Decimal, bank["allocations"])) == Decimal(bank["lineAmount"]), "Statement allocation mismatch")
    for journal in fixtures["journals"]:
        require(sum(map(Decimal, journal["debits"])) == sum(map(Decimal, journal["credits"])), f"Unbalanced sample: {journal['id']}")

    return {
        "checkedAtUtc": datetime.now(timezone.utc).isoformat(),
        "status": "passed",
        "featureUseCases": len(case_blocks),
        "adrs": len(adrs),
        "markdownFiles": len(files),
        "localLinks": link_count,
        "balancedJournalExamples": len(fixtures["journals"]),
        "arithmetic": "rounding, tax samples, moving average, settlement remainder, cash basis and bank allocations passed",
        "limitations": ["Specification arithmetic only; no production tax classification validated", "No business API, authorization, concurrency, DB transaction or broker recovery exercised", "No statutory receipt or external provider acceptance"]
    }


if __name__ == "__main__":
    output = ROOT / "artifacts/p0/spec-validation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"status": "running"}) + "\n", encoding="utf-8")
    try:
        result = validate()
    except Exception as exc:
        output.write_text(json.dumps({"status": "failed", "error": str(exc)}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=True))
