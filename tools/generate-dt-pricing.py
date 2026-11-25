#!/usr/bin/env python3
"""Rebuild dt-product-pricing.js from the SGS price list workbook (sheets DTDS DTXDS, DTDC DTXDC, DTDA DTXDA, DTDB DTXDB).

Usage: python3 -I tools/generate-dt-pricing.py PRICE_LIST.xlsx [dt-product-pricing.js]

Each sheet lists the DT models (rows 6-59) followed by the DTX models (rows 60-101). Model names differ by sheet
(DTDS1-185, DTDC1-185, DT1A-209, DTDB1-209 and the DTX equivalents); they are normalized to
<series><material letter><fans>-<model digits>, e.g. DTS1-185, DTXA1-271. Steel (S), copper (C), aluminum (A) and
stainless (B) match the coil material letters of the DT model key.

Base prices: A / HGC, HGS / HGP (waffle pan), HTS / HTP (tube pan), WD, ED, EDL. A blank or zero price means the
defrost type is not offered for that model. Options are stored as price arrays in "optionDefinitions" order
(0 = not offered). Heat tape, long throw adapter and SS fan guard / belly band are priced by number of fans
(LIST PRICE ADDITIONS); electric reheat is priced per fan section; blow thru and the extra hot gas reheat headers
are single prices. The DT list has no motor adder table; the 1/3 and 1/2 HP units are separate models.
"""
import json, re, sys
import openpyxl

SHEETS = {"DTDS DTXDS": "S", "DTDC DTXDC": "C", "DTDA DTXDA": "A", "DTDB DTXDB": "B"}
BASE = [("A_HGC", 2), ("HGS_HGP", 3), ("HTS_HTP", 4), ("WD", 5), ("ED", 6), ("EDL", 7)]
# (id, label, sheet column index or ("fans", additions column index) or ("flat", cell) or ("perfan", cell))
OPTIONS = [("DT_Pan_SS_Ins_Cover", "Full Coverage Drain Pan w/ SS Insulated Cover (IA/IHGC/IED)", 8),
           ("DT_Pan_Hygienic_IA", "Full Coverage Drain Pan w/ Fully Welded SS Insulated Cover (Hygienic) (IA/IHGC/IED)", 9),
           ("DT_Pan_Hygienic_HG", "Full Coverage Drain Pan w/ Fully Welded SS Insulated Cover (Hygienic) (HGP/HGS/HTP/HTS/EDL)", 10),
           ("DT_SS_Casing", "Stainless Steel Casing", 11),
           ("DT_Gold_Epoxy_Fins", "Gold Epoxy Pre-Coated Fins", 12),
           ("DT_Electrofin", "Electrofin Coating", 13),
           ("DT_Heresite", "Heresite Coating", 14),
           ("DT_Two_Speed_Motor", "1/2 HP 3 Phase Two Speed Motor", 15),
           ("DT_Inverter_Duty_Motor", "1/2 HP 3Ph Washdown Inverter Duty Motor", 16),
           ("DT_Heat_Tape", "Heat Tape in Drain Pan Cover", ("fans", 2)),
           ("DT_Long_Throw_Adapter", "Long Throw Adapter", ("fans", 3)),
           ("DT_SS_Fan_Guard", "SS Fan Guard & Belly Band", ("fans", 4)),
           ("DT_Blow_Thru", "Blow Thru Configuration (6 Row Only)", ("flat", "H116")),
           ("DT_Electric_Reheat", "4.65 KW Electric Reheat Per Fan Section (6 Rows Only)", ("perfan", "H118")),
           ("DT_Add_Hdrs_HGR", "Add'l Set of Hdrs for Hot Gas Reheat, or Distributor & Hdr", ("flat", "H119"))]

def num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def normalize(code):
    s = str(code).strip()
    m = re.match(r"^(DTX?)D([SCAB])(\d)-(\d+)$", s) or re.match(r"^(DTX?)(\d)([A])-(\d+)$", s)
    if not m:
        return None
    if m.group(2).isdigit():
        series, fans, material, digits = m.group(1), m.group(2), m.group(3), m.group(4)
    else:
        series, material, fans, digits = m.group(1), m.group(2), m.group(3), m.group(4)
    return f"{series}{material}{fans}-{digits}"

def main(xlsx, out):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    models = {}
    for sheet, material in SHEETS.items():
        ws = wb[sheet]
        by_fans = {}
        for r in range(109, 115):
            fans = ws.cell(r, 2).value
            by_fans[int(fans)] = [num(ws.cell(r, c).value) for c in (3, 4, 5)]
        flat = {"H116": num(ws["H116"].value), "H118": num(ws["H118"].value), "H119": num(ws["H119"].value)}
        for row in ws.iter_rows(min_row=6, max_row=101, values_only=True):
            key = normalize(row[1])
            if not key:
                continue
            assert key[len("DTX" if key.startswith("DTX") else "DT")] == material, (sheet, key)
            fans = int(re.match(r"^DTX?[SCAB](\d)", key).group(1))
            base = {n: round(num(row[c]), 2) for n, c in BASE if num(row[c])}
            if "A_HGC" not in base:
                continue
            options = []
            for oid, label, source in OPTIONS:
                if isinstance(source, int):
                    price = num(row[source])
                elif source[0] == "fans":
                    price = by_fans[fans][source[1] - 2]
                elif source[0] == "flat":
                    price = flat[source[1]]
                else:
                    price = flat[source[1]] * fans
                options.append(round(price, 2) if price else 0)
            assert key not in models, key
            models[key] = {"basePrices": base, "options": options}
    assert len(models) == 4 * 96, len(models)
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.selectSgsDtProductPricing = " +
                json.dumps({"optionDefinitions": [{"id": o[0], "label": o[1], "uom": "per Unit"} for o in OPTIONS],
                            "models": models}, separators=(",", ":")) + ";\n")
    print(len(models), "models written to", out)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "dt-product-pricing.js")
