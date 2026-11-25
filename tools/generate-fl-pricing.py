#!/usr/bin/env python3
"""Rebuild fl-product-pricing.js from the SGS price list workbook (FLA/FLB/FLC/FLS and CF FL Std Mtr Adds).

Usage: python3 -I tools/generate-fl-pricing.py PRICE_LIST.xlsx [fl-product-pricing.js]
Same structure as tools/generate-cf-pricing.py. FL has no Extended Legs, Flat Filter Section or Throw Away
Filters option. Model keys: FL + tube (D/E) + coil material (A/B/C/S) + fans + fan size, then
"-" + face area (2 digits) + rows deep + fins per inch, e.g. FLDA1F-0963.

The FLA (aluminum) sheet repeats the Gold Epoxy and Electrofin prices in its Discharge Duct Adapter and
2-Way Louvers columns and shows the louver price under Heat Tape on every block. The stainless (FLB) and
copper (FLC) sheets list identical Heat Tape / Discharge Duct Adapter / 2-Way Louvers prices, so aluminum
uses the FLB values for those three options.
"""
import json, sys
import openpyxl

SHEETS = {"FLA": "AL", "FLB": "SS", "FLC": "CU", "FLS": "HDG"}
BASE = [("A_HGC", 4), ("HGS_HGP", 5), ("WD", 6), ("ED", 7), ("EDL", 8)]
# (id, label, column index, section-wide)
OPTIONS = [("CF_Ins_Pan_Cover_MG", "Insulated Pan Cover (Mill Galv.)", 9, True),
           ("CF_Ins_Pan_Cover_SS", "Insulated Pan Cover (SS)", 10, True),
           ("CF_SS_Pan_Cover", "SS Pan Cover", 11, True),
           ("CF_SS_Casing", "SS Casing", 12, True),
           ("CF_Heat_Tape", "Heat Tape in Drain Pan Cover", 13, True),
           ("CF_Discharge_Duct_Adapter", "Discharge Duct Adapter", 14, True),
           ("CF_2_Way_Louvers", "2-Way Louvers", 15, True),
           ("CF_Gold_Epoxy_Fins", "Gold Epoxy Pre-Coated Fins", 16, False),
           ("CF_Electrofin", "Electrofin Coating", 17, False),
           ("CF_Heresite", "Heresite Coating", 18, False)]
SUSPECT_ALUMINUM_COLUMNS = (13, 14, 15)

def num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def split_model(code):
    s = str(code).strip()
    fpi = int(s[-1]); body = s[:-1]
    rows = int(body[-2:]) if body.endswith(("10", "12")) else int(body[-1])
    face = body[:len(body) - len(str(rows))].zfill(2)
    return face, rows, fpi

def sections_for(ws):
    sections = {}
    for row in ws.iter_rows(min_row=6, values_only=True):
        key = row[1]
        if not (isinstance(key, str) and key.startswith("FL")) or row[2] is None:
            continue
        face, rows, fpi = split_model(row[2])
        for oid, _, col, section_wide in OPTIONS:
            v = num(row[col])
            if section_wide and v:
                old = sections.setdefault((key, face, fpi, oid), v)
                assert abs(old - v) < 0.005, (ws.title, key, face, fpi, oid, old, v)
    return sections

def main(xlsx, out):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    matrix = [[cell.value for cell in row] for row in wb["CF FL Std Mtr Adds"].iter_rows()]
    hdr = next(i for i, r in enumerate(matrix) if r[3] == 1 and r[4] == 1.5)
    required = matrix[hdr][3:13]
    adders = {}
    for r in matrix[hdr + 1:hdr + 9]:
        adders[str(r[2])] = {str(q): round(v, 2) for q, v in zip(required, r[3:13]) if isinstance(v, (int, float))}
    assert len(adders) == 8

    sheet_sections = {name: sections_for(wb[name]) for name in SHEETS}
    # Aluminum's heat tape / duct adapter / louvers come from the stainless sheet (see module docstring);
    # stainless and copper must agree for that to be valid.
    for (key, face, fpi, oid), value in sheet_sections["FLC"].items():
        other = sheet_sections["FLB"].get((key.replace("FLDC", "FLDB"), face, fpi, oid))
        if oid in ("CF_Heat_Tape", "CF_Discharge_Duct_Adapter", "CF_2_Way_Louvers") and other:
            assert abs(value - other) < 0.005, (key, face, fpi, oid, value, other)

    models = {}
    for sheet, material in SHEETS.items():
        ws = wb[sheet]
        sections = sheet_sections[sheet]
        for row in ws.iter_rows(min_row=6, values_only=True):
            key = row[1]
            if not (isinstance(key, str) and key.startswith("FL")) or row[2] is None:
                continue
            assert key[3] == {"AL": "A", "SS": "B", "CU": "C", "HDG": "S"}[material], (sheet, key)
            face, rows, fpi = split_model(row[2])
            base = {n: round(num(row[c]), 2) for n, c in BASE if num(row[c])}
            if "A_HGC" not in base:
                continue
            options = []
            for oid, label, col, section_wide in OPTIONS:
                if section_wide:
                    if material == "AL" and col in SUSPECT_ALUMINUM_COLUMNS:
                        price = sheet_sections["FLB"].get((key[:3] + "B" + key[4:], face, fpi, oid))
                    else:
                        price = sections.get((key, face, fpi, oid))
                else:
                    price = num(row[col])
                options.append(round(price, 2) if price else 0)
            models[f"{key}-{face}{rows}{fpi}"] = {
                "coilMaterial": material,
                "standardHp": float(row[3]),
                "basePrices": base,
                "options": options,
            }
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.selectSgsFlProductPricing = " +
                json.dumps({"optionDefinitions": [{"id": o[0], "label": o[1], "uom": "per Unit"} for o in OPTIONS],
                            "motorAdders": adders, "models": models}, separators=(",", ":")) + ";\n")
    print(len(models), "models written to", out)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "fl-product-pricing.js")
