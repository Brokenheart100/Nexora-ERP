"""Isolated Chromium PDF probe. Needs dotnet 10, PowerShell, pypdf, fonttools, pdftoppm."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from importlib.metadata import version
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from pypdf import PdfReader
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
FONT_COMMIT = "a85815a42757630ce188fdad368c2dfc444d4773"
FONT_BASE = f"https://raw.githubusercontent.com/google/fonts/{FONT_COMMIT}/ofl/notosanssc/"


def main() -> None:
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--pdftoppm", default="pdftoppm")
    args = parser.parse_args()
    output = ROOT / "artifacts/p0/pdf-probe"
    output.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix="nexora-p0-pdf-"))
    report = {
        "checkedAtUtc": datetime.now(timezone.utc).isoformat(),
        "status": "running", "playwrightVersion": "1.64.1",
        "fontCommit": FONT_COMMIT, "scratchDirectory": str(scratch),
        "pythonPackages": {name: version(name) for name in ["pypdf", "fonttools"]},
        "visualReview": "pending", "steps": [],
        "limitations": ["Windows probe only; Linux container and physical printing pending",
                        "Technical sample only; no statutory invoice or fiscal donation receipt"],
    }
    try:
        for local, remote in [("NotoSansSC.ttf", "NotoSansSC%5Bwght%5D.ttf"), ("OFL.txt", "OFL.txt")]:
            with urlopen(FONT_BASE + remote, timeout=90) as response:
                content = response.read()
            expected_hash = {"NotoSansSC.ttf": "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da",
                             "OFL.txt": "1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9"}[local]
            assert hashlib.sha256(content).hexdigest() == expected_hash, f"Source hash mismatch: {local}"
            (scratch / local).write_bytes(content)
            report[local] = {"url": FONT_BASE + remote, "sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content)}
        shutil.copy2(scratch / "OFL.txt", output / "OFL.txt")
        for name in ["PdfProbe.csproj", "Program.cs"]:
            shutil.copy2(Path(__file__).with_name("pdf-probe") / name, scratch / name)
        # A static, exact-character subset avoids variable-font Type 3 output and
        # duplicate cmap aliases (e.g. Kangxi radicals) corrupting PDF ToUnicode.
        source_text = (scratch / "Program.cs").read_text(encoding="utf-8")
        pinned_font = TTFont(scratch / "NotoSansSC.ttf")
        instantiateVariableFont(pinned_font, {"wght": 400}, inplace=True)
        subsetter = subset.Subsetter()
        subsetter.populate(unicodes={ord(char) for char in source_text})
        subsetter.subset(pinned_font)
        render_font = scratch / "NotoSansSC-probe-subset.ttf"
        pinned_font.save(render_font)
        report["fontDerivation"] = {"weight": 400, "subset": "Unicode characters in trusted Program.cs fixture", "sha256": hashlib.sha256(render_font.read_bytes()).hexdigest()}
        (scratch / "NuGet.Config").write_text('<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json" /></packageSources></configuration>', encoding="utf-8")
        steps = [
            ("restore", ["dotnet", "restore", "--configfile", "NuGet.Config", "--use-lock-file", "--nologo"]),
            ("build", ["dotnet", "build", "--no-restore", "--nologo"]),
            ("browser-install", ["pwsh", "-NoProfile", "-File", str(scratch / "bin/Debug/net10.0/playwright.ps1"), "install", "chromium", "--only-shell"]),
            ("generate", ["dotnet", "run", "--no-build", "--no-restore", "--", str(render_font), str(output / "sample.pdf")]),
            ("render", [args.pdftoppm, "-r", "100", "-png", str(output / "sample.pdf"), str(output / "page")]),
        ]
        for name, command in steps:
            process = subprocess.run(command, cwd=scratch, capture_output=True, encoding="utf-8", errors="replace", timeout=300)
            (output / f"{name}.log").write_text(process.stdout + process.stderr, encoding="utf-8")
            report["steps"].append({"name": name, "exitCode": process.returncode})
            if process.returncode:
                raise RuntimeError(f"{name} failed; see {output / (name + '.log')}")
        shutil.copy2(scratch / "packages.lock.json", output / "packages.lock.json")
        pdf = PdfReader(output / "sample.pdf")
        assert len(pdf.pages) == 2, "Expected two pages"
        text = "\n".join(page.extract_text() for page in pdf.pages)
        for expected in ["销售单据", "中文渲染样例", "非税务发票", "270.00", "35.10", "¥305.10", "业务收据", "第 2 / 2 页"]:
            assert expected in text, f"Missing extracted text: {expected}"
        embedded = []
        for page in pdf.pages:
            for reference in page["/Resources"]["/Font"].values():
                font = reference.get_object()
                children = font.get("/DescendantFonts", [font])
                for child in children:
                    descriptor = child.get_object().get("/FontDescriptor")
                    if descriptor:
                        descriptor = descriptor.get_object()
                        embedded.append(any(descriptor.get(key) for key in ["/FontFile", "/FontFile2", "/FontFile3"]))
        assert embedded and all(embedded), "Every font must be embedded"
        (output / "extracted.txt").write_text(text, encoding="utf-8")
        report.update(status="automated-checks-passed", pages=2, embeddedFontDescriptors=len(embedded), pdfSha256=hashlib.sha256((output / "sample.pdf").read_bytes()).hexdigest())
    except Exception as error:
        report.update(status="failed", error=str(error))
        raise
    finally:
        (output / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
