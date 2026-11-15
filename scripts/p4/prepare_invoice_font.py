"""Build the reproducible, static invoice font from the verified P0 source."""
import argparse
from pathlib import Path

from fontTools import __version__
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONTTOOLS_VERSION = "4.62.1"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if __version__ != FONTTOOLS_VERSION:
        raise SystemExit(f"Use fonttools=={FONTTOOLS_VERSION} to prepare the invoice font.")
    with TTFont(args.source, recalcTimestamp=False) as font:
        instantiateVariableFont(font, {"wght": 400}, inplace=True)
        # Several radicals alias common ideographs. Exclude those aliases so Chromium's
        # ToUnicode table retains the business text written in the source document.
        for table in font["cmap"].tables:
            if table.isUnicode():
                for codepoint in list(table.cmap):
                    if 0x2E80 <= codepoint <= 0x2FD5 or 0xF900 <= codepoint <= 0xFAFF or 0x2F800 <= codepoint <= 0x2FA1F:
                        del table.cmap[codepoint]
        font.save(args.output)


if __name__ == "__main__":
    main()
