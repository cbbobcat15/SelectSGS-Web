#!/usr/bin/env python3
"""Rebuild dt-ratings.js from the DT/DTX unit data workbook (DT_DTX_Unit_Data_Tables.xlsx, sheet "All DT-DTX Data").

Usage: python3 -I tools/generate-dt-ratings.py DT_DTX_Unit_Data_Tables.xlsx [dt-ratings.js]

The workbook was transcribed from DT_Information.pdf (ES 14602.6) pages 9-14. Each row carries its shipping weights
under "Wt Steel / Copper / Aluminum / Stainless Steel"; they are mapped to the app's coil material codes
(HDG, CU, AL, SS). The low suction temperature correction factors come from PDF section 1.6 and the unit
dimensions (length by number of fans, depth, height by DT/DTX) from the PDF section 2.1 drawings.
"""
import json, sys
import openpyxl

WEIGHT_COLUMNS = {"Wt Steel (lb)": "HDG", "Wt Copper (lb)": "CU", "Wt Aluminum (lb)": "AL", "Wt Stainless Steel (lb)": "SS"}
FAN_HP_TEXT = {"1/3": 1 / 3, "1/2": 0.5}

# Section 1.6: factor applied to DX-frosted ratings at low suction temperature, interpolated linearly between points.
CAPACITY_CORRECTIONS = {"lowSuctionTemperaturePoints": [[-20, 1.0], [-30, 0.9], [-40, 0.8], [-50, 0.7]]}
# Section 2.1: overall length by number of fans, depth, and height (DT 39.75 in, DTX 48.25 in).
LENGTHS = {1: 52.375, 2: 80.38, 3: 108.5, 4: 136.25, 5: 164.25, 6: 192.25}
DEPTH = 41.25
HEIGHTS = {"DT": 39.75, "DTX": 48.25}

def main(xlsx, out):
    ws = openpyxl.load_workbook(xlsx, data_only=True)["All DT-DTX Data"]
    header = [c.value for c in ws[1]]
    col = {name: i for i, name in enumerate(header)}
    rows = []
    for values in ws.iter_rows(min_row=2, values_only=True):
        if not values[0]:
            continue
        get = lambda name: values[col[name]]
        hp_text = str(get("Fans x HP (as printed)")).split("x")[1].strip()
        weights = {code: get(name) for name, code in WEIGHT_COLUMNS.items() if get(name) is not None}
        rows.append({
            "model": get("Model #"),
            "series": get("Series"),
            "tube": "C" if get("Tube OD") == '5/8"' else "D",
            "fans": int(str(get("Model #"))[0]),  # the model prefix is the fan count (3-720 prints "2 x 1/3" in the PDF)
            "fanHp": round(FAN_HP_TEXT[hp_text], 4),
            "fanHpText": hp_text,
            "rowsDeep": int(get("Rows Deep")),
            "finsPerInch": int(get("FPI")),
            "faceArea": get("Face Area (sq ft)"),
            "airFlowCfm": get("CFM"),
            "faceVelocityFpm": get("Face Velocity (FPM)"),
            "wetDx": get("Wet DX (BTUH/1°F TD)"),
            "wetRec": get("Wet REC (BTUH/1°F TD)"),
            "frostedDx": get("Frosted DX (BTUH/1°F TD)"),
            "frostedRec": get("Frosted REC (BTUH/1°F TD)"),
            "surfaceAreaSqFt": get("Surface Area (sq ft)"),
            "coilVolumeFt3": get("Coil Volume (cu ft)"),
            "weightsLb": weights,
            "sourcePage": get("Source Page"),
        })
    assert len(rows) == 288, len(rows)
    dimensions = {series: {str(fans): [LENGTHS[fans], DEPTH, HEIGHTS[series]] for fans in LENGTHS} for series in HEIGHTS}
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.selectSgsDtCapacityCorrections = " + json.dumps(CAPACITY_CORRECTIONS, separators=(",", ":")) + ";\n")
        f.write("window.selectSgsDtDimensions = " + json.dumps(dimensions, separators=(",", ":")) + ";\n")
        f.write("window.selectSgsDtRatings = " + json.dumps(rows, separators=(",", ":")) + ";\n")
    print(len(rows), "ratings written to", out)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "dt-ratings.js")
