#!/usr/bin/env python3
"""Rebuild cf-product-pricing.js from the SGS price list workbook (CFA/CFB/CFC/CFS and CF FL Std Mtr Adds).

Usage: python3 -I tools/generate-cf-pricing.py PRICE_LIST.xlsx [cf-product-pricing.js]
Model keys follow the price sheets: CF + tube (D/E) + coil material (A/B/C/S) + fans + fan size, then
"-" + face area (2 digits, zero padded) + rows deep + fins per inch, e.g. CFDA1F-0963.
"options" lists each option price in optionDefinitions order (0 = not offered).
Base prices are at each row's standard motor HP. Motor adders are the "CF FL Std Mtr Adds" matrix
(standard HP -> selected HP, per motor). Option prices left blank on a row apply to the whole
block (the 6/8/10/12-row lines of one coil and fins-per-inch), so each block's price is applied to all of its rows;
Gold Epoxy / Electrofin / Heresite coatings are per row.
"""
import json, re, sys
import openpyxl

SHEETS = {"CFA": "AL", "CFB": "SS", "CFC": "CU", "CFS": "HDG"}
BASE = [("A_HGC", 4), ("HGS_HGP", 5), ("WD", 6), ("ED", 7), ("EDL", 8)]
# (id, label, 1-based? no: 0-based column index in the sheet row tuple, section-wide)
OPTIONS = [("CF_Ins_Pan_Cover_MG", "Insulated Pan Cover (Mill Galv.)", 9, True),
           ("CF_Ins_Pan_Cover_SS", "Insulated Pan Cover (SS)", 10, True),
           ("CF_SS_Pan_Cover", "SS Pan Cover", 11, True),
           ("CF_SS_Casing", "SS Casing", 12, True),
           ("CF_Heat_Tape", "Heat Tape in Drain Pan Cover", 13, True),
           ("CF_Extended_Legs", '24" Extended Legs', 14, True),
           ("CF_Discharge_Duct_Adapter", "Discharge Duct Adapter", 15, True),
           ("CF_Flat_Filter_Section", "Flat Filter Section", 16, True),
           ("CF_Throw_Away_Filters", "Set of Throw Away Filters", 17, True),
           ("CF_2_Way_Louvers", "2-Way Louvers", 18, True),
           ("CF_Gold_Epoxy_Fins", "Gold Epoxy Pre-Coated Fins", 19, False),
           ("CF_Electrofin", "Electrofin Coating", 20, False),
           ("CF_Heresite", "Heresite Coating", 21, False)]

def num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def split_model(code):
    s = str(code).strip()
    fpi = int(s[-1]); body = s[:-1]
    rows = int(body[-2:]) if body.endswith(("10", "12")) else int(body[-1])
    face = body[:len(body) - len(str(rows))].zfill(2)
    return face, rows, fpi

def main(xlsx, out):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    ws = wb["CF FL Std Mtr Adds"]
    matrix = [[cell.value for cell in row] for row in ws.iter_rows()]
    hdr = next(i for i, r in enumerate(matrix) if r[3] == 1 and r[4] == 1.5)
    required = matrix[hdr][3:13]
    adders = {}
    for r in matrix[hdr + 1:hdr + 9]:
        adders[str(r[2])] = {str(q): round(v, 2) for q, v in zip(required, r[3:13]) if isinstance(v, (int, float))}
    assert len(adders) == 8, adders.keys()
    models = {}
    for sheet, material in SHEETS.items():
        ws = wb[sheet]
        sections = {}
        for row in ws.iter_rows(min_row=6, values_only=True):
            key = row[1]
            if not (isinstance(key, str) and key.startswith("CF")) or row[2] is None:
                continue
            face, rows, fpi = split_model(row[2])
            for oid, _, col, section_wide in OPTIONS:
                if not section_wide:
                    continue
                v = num(row[col])
                if v:
                    old = sections.setdefault((key, face, fpi, oid), v)
                    assert abs(old - v) < 0.005, (sheet, key, face, fpi, oid, old, v)
        for row in ws.iter_rows(min_row=6, values_only=True):
            key = row[1]
            if not (isinstance(key, str) and key.startswith("CF")) or row[2] is None:
                continue
            assert key[3] == {"AL": "A", "SS": "B", "CU": "C", "HDG": "S"}[material], (sheet, key)
            face, rows, fpi = split_model(row[2])
            base = {n: round(num(row[c]), 2) for n, c in BASE if num(row[c])}
            if "A_HGC" not in base:
                continue
            options = []  # prices in OPTIONS order; 0 = not offered
            for oid, label, col, section_wide in OPTIONS:
                price = sections.get((key, face, fpi, oid)) if section_wide else num(row[col])
                options.append(round(price, 2) if price else 0)
            models[f"{key}-{face}{rows}{fpi}"] = {
                "coilMaterial": material,
                "standardHp": float(row[3]),
                "basePrices": base,
                "options": options,
            }
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.selectSgsCfProductPricing = " +
                json.dumps({"optionDefinitions": [{"id": o[0], "label": o[1], "uom": "per Unit"} for o in OPTIONS],
                    "motorAdders": adders, "models": models}, separators=(",", ":")) + ";\n")
    print(len(models), "models written to", out)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "cf-product-pricing.js")
