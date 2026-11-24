#!/usr/bin/env python3
"""Rebuild stc-dimensions.js from page 27 (Schematic Details) of the STC technical PDF.

Usage: python3 -I tools/generate-stc-dimensions.py SGS-STC-TECH-22.pdf [stc-dimensions.js]
Output: window.selectSgsStcDimensions[fans][fanDiameterIn][rowsDeep] = [length, width, height] (inches).
"""
import json, re, sys
import pdfplumber

ROW = re.compile(r'^(?:(24|30)" )?(4|6|8) (\d+\.\d\d) (\d+\.\d\d) (\d+\.\d\d)\b')

def main(pdf_path, out):
    with pdfplumber.open(pdf_path) as pdf:
        text = pdf.pages[26].extract_text()
    assert "Schematic Details" in text and "Heater Removal Clearance" in text, "page 27 is not the dimension page"
    rows = []
    for line in text.split("\n"):
        m = ROW.match(line.strip())
        if m:
            rows.append((m.group(1), int(m.group(2)), [float(m.group(i)) for i in (3, 4, 5)]))
    assert len(rows) == 36, len(rows)
    data = {}
    for index, (label, rows_deep, size) in enumerate(rows):
        fans, within = divmod(index, 6)
        diameter = 24 if within < 3 else 30
        assert rows_deep == (4, 6, 8)[within % 3], (index, rows_deep)
        if label:
            assert int(label) == diameter, (index, label, diameter)
        data.setdefault(str(fans + 1), {}).setdefault(str(diameter), {})[str(rows_deep)] = size
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.selectSgsStcDimensions = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print("wrote", out)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "stc-dimensions.js")
