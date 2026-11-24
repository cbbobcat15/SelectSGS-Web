#!/usr/bin/env python3
"""Rebuild cf-ratings.js from the CF performance workbook, the CF/FL correction-factor workbook and the CF technical PDF.

Usage: python3 -I tools/generate-cf-ratings.py PERFORMANCE.xlsx CORRECTIONS.xlsx CF_TECH.pdf [cf-ratings.js]
Ratings are BTUH per degree F TD at the listed motor HP, ESP and fins per inch (3/4" D and 1" E tube tables).
Dimensions (L x W x H, inches) come from the "Schematic Details" table on page 37 of SGS-CF-TECH-20.
"""
import json, re, sys
import openpyxl
import pdfplumber

def split_model(model):
    prefix, rest = model.split("-")
    rows = int(rest[-2:]) if rest.endswith(("10", "12")) and len(rest) >= 4 else int(rest[-1])
    face = rest[:len(rest) - len(str(rows))]
    return prefix[0], prefix[1], face, rows

def num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def corrections(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    # Verified against the supplied tables; read back from the workbook where practical.
    t1 = [[c.value for c in r] for r in wb["Table 1"].iter_rows()]
    t2 = [[c.value for c in r] for r in wb["Table 2"].iter_rows()]
    return t1, t2

def dimensions(pdf_path):
    text = pdfplumber.open(pdf_path).pages[36].extract_text()
    dims = {}
    for line in text.splitlines():
        m = re.match(r"^([1-4Il!])([A-H])[\s·\-]*(\d{2,3})\s+(.*)$", line.strip())
        if not m:
            continue
        nums = [float(x.replace("-", ".")) for x in re.findall(r"\d+(?:[.\-]\d+)?", m.group(4))]
        if len(nums) < 3:
            continue
        dims[f"{'1' if m.group(1) in 'Il!' else m.group(1)}{m.group(2)}-{m.group(3)}"] = nums[:3]
    # The printed height for 3C-59 (50) is a typo: every other 3C model is 60" high.
    dims["3C-59"][2] = 60.0
    return dims

def main(perf, corr, pdf, out):
    ws = openpyxl.load_workbook(perf, data_only=True)["Coil Performance"]
    ratings = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r[0]:
            continue
        fans, size, face, rows = split_model(r[0])
        ratings.append({
            "model": r[0], "tube": r[8][-1], "fans": int(fans), "fanSize": size,
            "faceArea": face, "rowsDeep": rows, "finsPerInch": int(r[4]),
            "fanHp": num(r[1]), "esp": num(r[3]), "airFlowCfm": num(r[5]),
            "faceVelocityFpm": num(r[6]), "capacityBtuhPerTd": num(r[7]),
            "surfaceAreaSqFt": num(r[10]), "coilVolumeFt3": num(r[11]),
            "steelWeightLb": num(r[12]), "aluminumWeightLb": num(r[13]),
        })
    t1, t2 = corrections(corr)
    assert [r[1:5] for r in t2 if r[0] == 6] == [[0.81, 1, 1.08, 1.16]], "Table 2 changed; update the tables below"
    assert [r[1:5] for r in t1 if r[0] == "Ammonia TEV to 0°F SST**"] == [[0.83, 0.84, 0.85, 0.85]]
    dims = dimensions(pdf)
    bases = {f"{x['fans']}{x['fanSize']}-{x['faceArea']}" for x in ratings}
    assert bases <= set(dims), sorted(bases - set(dims))
    rows = (6, 8, 10, 12)
    table1 = {
        "variableFin3": [0.85, 0.89, 0.91, 0.92], "variableFin4": [0.85, 0.89, 0.91, 0.92],
        "ammoniaTevTo0FSst": [0.83, 0.84, 0.85, 0.85],
    }
    # Table 2 (rows 6/8/10/12): frosted below 30F by face velocity; wet above 30F by FPI and face velocity
    frosted = {500: [0.81, 0.89, 0.88, 0.85], 600: [1, 1, 1, 1],
               700: [1.08, 1.08, 1.09, 1.10], 800: [1.16, 1.17, 1.17, 1.19]}
    wet = {4: {400: [0.98, 0.97, 0.97, 0.93], 500: [1.08, 1.09, 1.10, 1.10], 600: [1.11, 1.12, 1.13, 1.13]},
           6: {400: [0.92, 0.90, 0.89, 0.86], 500: [1.00, 1.00, 1.00, 1.00], 600: [1.03, 1.04, 1.04, 1.04]}}
    def by_rows(values):
        return {str(r): v for r, v in zip(rows, values)}
    data = {
        "capacityCorrections": {
            "ammoniaDx": by_rows(table1["ammoniaTevTo0FSst"]),
            "frostedByFaceVelocity": {str(k): by_rows(v) for k, v in frosted.items()},
            "wetByFinsAndFaceVelocity": {str(f): {str(k): by_rows(v) for k, v in d.items()} for f, d in wet.items()},
        },
        "dimensions": {k: dims[k] for k in sorted(bases)},
    }
    with open(out, "w", encoding="utf-8") as f:
        f.write("// CF ratings, correction factors and dimensions transcribed from the supplied CF engineering data.\n")
        f.write("window.selectSgsCfCapacityCorrections = " + json.dumps(data["capacityCorrections"], separators=(",", ":")) + ";\n")
        f.write("window.selectSgsCfDimensions = " + json.dumps(data["dimensions"], separators=(",", ":")) + ";\n")
        f.write("window.selectSgsCfRatings = [\n" + ",\n".join(json.dumps(x, separators=(",", ":")) for x in ratings) + "\n];\n")
    print(len(ratings), "ratings,", len(data["dimensions"]), "dimension rows written to", out)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "cf-ratings.js")
