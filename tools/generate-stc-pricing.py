#!/usr/bin/env python3
"""Rebuild stc-product-pricing.js from the SGS price list workbook (STCA/STCC/STCB/STCS sheets).

Usage: python3 -I tools/generate-stc-pricing.py PRICE_LIST.xlsx [stc-product-pricing.js]
SS Casing, Insulated Pan Cover and SS Pan Cover prices depend only on coil sheet, number of fans
and fan diameter; the workbook fills them on a few rows per group, so each group's price is applied to
every model in that group (the script fails if a group has conflicting prices).
The SS Pan Cover price written here is the Insulated Pan Cover price plus the SS Pan Cover price.
Fan guards are priced per unit by number of fans (24" or 30" diameter) on each sheet.
"""
import json, re, sys
import openpyxl

SHEETS = {"STCA": ("A", "AL"), "STCC": ("C", "CU"), "STCB": ("B", "SS"), "STCS": ("S", "HDG")}
OPTIONS = [("SS_Casing", "SS Casing"), ("Insulated_Pan_Cover", "Insulated Pan Cover"),
           ("SS_Pan_Cover", "SS Pan Cover"), ("Gold_Epoxy_Fins", "Gold Epoxy Pre-Coated Fins")]
MODEL = re.compile(r"^STC\d[ABCS]-\d+-[ABC]$")

def num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def main(xlsx, out):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    models = {}
    for sheet, (code, material) in SHEETS.items():
        ws = wb[sheet]
        guards = {}
        for r in range(1, ws.max_row + 1):
            fans = ws.cell(r, 13).value
            if isinstance(fans, (int, float)) and num(ws.cell(r, 14).value) and num(ws.cell(r, 15).value):
                guards[int(fans)] = (num(ws.cell(r, 14).value), num(ws.cell(r, 15).value))
        assert sorted(guards) == [1, 2, 3, 4, 5, 6], (sheet, guards)
        group = {}
        for r in range(7, ws.max_row + 1):
            for col, opt0, dia in ((2, 7, 24), (13, 19, 30)):
                name = ws.cell(r, col).value
                if isinstance(name, str) and MODEL.match(name):
                    for i in range(3):
                        price = num(ws.cell(r, opt0 + i).value)
                        if price:
                            old = group.setdefault((int(name[3]), dia, i), price)
                            assert abs(old - price) < 0.005, (sheet, name, i, old, price)
        for r in range(7, ws.max_row + 1):
            # (model cell column, first price column, first option column, fan diameter)
            for col, price0, opt0, dia in ((2, 3, 7, 24), (13, 15, 19, 30), (14, 15, 19, 30)):
                name = ws.cell(r, col).value
                if not (isinstance(name, str) and MODEL.match(name)):
                    continue
                assert name[4] == code, (sheet, name)
                base = [ws.cell(r, price0 + i).value for i in range(4)]
                if not num(base[0]):
                    continue
                options = []
                fans = int(name[3])
                for i, (oid, label) in enumerate(OPTIONS):
                    if i < 3:
                        price = group.get((fans, dia, i))
                        if i == 2 and price:  # SS Pan Cover is added on top of the Insulated Pan Cover
                            price += group[(fans, dia, 1)]
                    else:
                        price = num(ws.cell(r, opt0 + i).value)
                    if price:
                        options.append({"id": oid, "label": label, "price": round(price, 2), "uom": "per Unit"})
                options.append({"id": f"SS_Fan_Guard_{dia}", "label": f'SS Fan Guard ({dia}")',
                                "price": round(guards[fans][0 if dia == 24 else 1], 2), "uom": "per Unit"})
                models[name] = {
                    "coilMaterial": material,
                    "basePrices": {"A/HGC": base[0], "HTS": base[1], "ED": base[2], "EDL": base[3]},
                    "options": options,
                }
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.selectSgsStcProductPricing = " + json.dumps({"models": models}, separators=(",", ":")) + ";\n")
    print(len(models), "models written to", out)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "stc-product-pricing.js")
