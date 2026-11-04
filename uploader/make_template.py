"""Write the Excel template the operator fills in: python make_template.py <output.xlsx>."""

import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font

HEADERS = ["Name", "Category", "Description", "Version", "Plugin ID"]
EXAMPLE = ["Rig Helper", "Animation", "Helps you build and bind character rigs faster.", "1.0", ""]


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python make_template.py <output.xlsx>")
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Plugins"
    sheet.append(HEADERS)
    sheet.append(EXAMPLE)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    for column, width in zip("ABCDE", (28, 18, 60, 10, 16)):
        sheet.column_dimensions[column].width = width
    # "Plugin ID" is filled in by the uploader after a run; leave it empty for new plugins.
    output = Path(sys.argv[1])
    workbook.save(output)
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
