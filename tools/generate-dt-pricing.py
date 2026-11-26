#!/usr/bin/env python3
"""Rebuild dt-product-pricing.js from the SGS price list workbook (sheets DTDS DTXDS, DTDC DTXDC, DTDA DTXDA, DTDB DTXDB).

Usage: python3 -I tools/generate-dt-pricing.py PRICE_LIST.xlsx [dt-product-pricing.js] [SELECTSGS_DATABASE.xlsx]

When the SelectSGS database workbook is given as the third argument, every DT/DTX price (3/4" and 5/8") comes from its
sheet tbl_PRICE_TABLE_NEW and the price list sheets are only used for what the database does not contain (the SS fan
guard and belly band price) and for the list of models. The 5/8" stainless tube units (DTCB / DTXCB, key prefix
DT5B / DTX5B) exist only in the database. Blow thru (BT / BTX) is a separate product line and is not an option here.
Differences from the price list sheets are printed when the file is generated.

Each sheet lists the DT models (rows 6-59) followed by the DTX models (rows 60-101). Model names differ by sheet
(DTDS1-185, DTDC1-185, DT1A-209, DTDB1-209 and the DTX equivalents); they are normalized to
<series><material letter><fans>-<model digits>, e.g. DTS1-185, DTXA1-271. Steel (S), copper (C), aluminum (A) and
stainless (B) match the coil material letters of the DT model key.

Base prices: A / HGC, HGS / HGP (waffle pan), HTS / HTP (tube pan), WD, ED, EDL. A blank or zero price means the
defrost type is not offered for that model. Options are stored as price arrays in "optionDefinitions" order
(0 = not offered). Heat tape, long throw adapter and SS fan guard / belly band are priced by number of fans
(LIST PRICE ADDITIONS); electric reheat is priced per fan section; the extra hot gas reheat headers
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
           ("DT_Heat_Tape_115", "Heat Tape in Full Coverage Drain Pan Cover - 115 Volt", ("fans", 2)),
           ("DT_Heat_Tape_230", "Heat Tape in Full Coverage Drain Pan Cover - 230 Volt", ("fans", 2)),
           ("DT_Long_Throw_Adapter", "Long Throw Adapter", ("fans", 3)),
           ("DT_SS_Fan_Guard", "SS Fan Guard & Belly Band", ("fans", 4)),
           ("DT_Electric_Reheat", "4.65 KW Electric Reheat Per Fan Section (6 Rows Only)", ("perfan", "H118")),
           ("DT_Add_Hdrs_HGR", "Add'l Set of Hdrs for Hot Gas Reheat, or Distributor & Hdr", ("flat", "H119")),
           ("DT_Brass_Distributor", "Brass Distributor on Steel Coil", ("none",)),
           ("DT_TEV_Mount", "Mounted TEV (Copper Coils Only)", ("none",)),
           ("DT_Coil_End_Covers", "Coil End Covers (ED/EDL/WD)", ("none",)),
           # Required with the HGR reheat coil selection (REHEAT_CODE = HGR in the database), as on the BTR.
           ("DT_Add_Head_HGR", "Add'l Set of Headers for Hot Gas Reheat", ("none",))]

DB_OPTION_CODES = ["FCPan_SS_IA_IHGC_IED", "FCPan_SS_Welded_IA_IHGC_IED", "FCPan_SS_Welded_HGP_HGS_HTP_HTS", "SS_Casing",
                   "Gold_Epx_Pre", "Elec_Fin_Coat", "Heresite_C", "Motor_Eff_0.5_2S", "inv_ready_mtr"]
DB_BASE = {"A": "A_HGC", "HGS": "HGS_HGP", "HTS": "HTS_HTP", "WD": "WD", "ED": "ED", "EDL": "EDL"}

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

DB_BASE_CODES = {"A_HGC": ("Base_A", "Base_HGC"), "HGS_HGP": ("Base_HGS", "Base_HGP"), "HTS_HTP": ("Base_HTS", "Base_HTP"),
                 "WD": ("Base_WD",), "ED": ("Base_ED",), "EDL": ("Base_EDL",)}
# Option id -> database option code. Heat tape, long throw and gold epoxy prices already include the fan count in the
# database; electric reheat is a per fan section price. SS fan guard is not in the database (price list value).
DB_OPTION_MAP = {"DT_Pan_SS_Ins_Cover": "FCPan_SS_IA_IHGC_IED", "DT_Pan_Hygienic_IA": "FCPan_SS_Welded_IA_IHGC_IED",
                 "DT_Pan_Hygienic_HG": "FCPan_SS_Welded_HGP_HGS_HTP_HTS", "DT_SS_Casing": "SS_Casing",
                 "DT_Gold_Epoxy_Fins": "Gold_Epx_Pre", "DT_Electrofin": "Elec_Fin_Coat", "DT_Heresite": "Heresite_C",
                 "DT_Two_Speed_Motor": "Motor_Eff_0.5_2S", "DT_Inverter_Duty_Motor": "inv_ready_mtr",
                 "DT_Heat_Tape_115": "FCPan_HeatTape_115", "DT_Heat_Tape_230": "FCPan_HeatTape_230",
                 "DT_Brass_Distributor": "Brass_Distr", "DT_TEV_Mount": "TEV_Mount", "DT_Coil_End_Covers": "Coil_End_Covers", "DT_Add_Head_HGR": "Add_Head_HGR",
                 "DT_Long_Throw_Adapter": "Long_Throw",
                 "DT_Electric_Reheat": "Reheat_per_Fan_6R", "DT_Add_Hdrs_HGR": "Add_Head_HGR_D"}

def database_key(code):
    m = re.match(r"^(DTX?)(?:D([SCAB])|C(B))(\d)-(\d+)$", code)
    if not m:
        return None
    series, material, five_eighths, fans, digits = m.groups()
    return f"{series}{'5B' if five_eighths else material}{fans}-{digits}"

def apply_database(models, database, sheet_additions):
    """Price every DT/DTX model (3/4" and 5/8") from tbl_PRICE_TABLE_NEW; return a list of differences from the sheets."""
    wb = openpyxl.load_workbook(database, read_only=True, data_only=True)
    db = {}
    for row in wb["tbl_PRICE_TABLE_NEW"].iter_rows(min_row=2, values_only=True):
        if row[0] and re.match(r"^DTX?(D[SCAB]|CB)\d-\d+$", str(row[0])):
            db.setdefault(row[0], {}).setdefault(row[7], num(row[9]))
    by_key = {}
    for code, values in db.items():
        key = database_key(code)
        if key:
            by_key[key] = values
    sheet_guard = {mat: adds[0] for mat, adds in sheet_additions.items()}
    differences = []
    result = {}
    for key in sorted(set(models) | {k for k in by_key if k.startswith(("DT5B", "DTX5B"))}):
        values = by_key.get(key)
        if values is None:
            raise SystemExit(f"No database prices for {key}")
        series, material, fans, digits = re.match(r"^(DTX?)(5B|[SCAB])(\d)-(\d+)$", key).groups()
        fans = int(fans)
        base = {}
        for name, codes in DB_BASE_CODES.items():
            prices = [values[c] for c in codes if values.get(c)]
            assert len(set(prices)) <= 1, (key, name, prices)
            if prices:
                base[name] = round(prices[0], 2)
        if "A_HGC" not in base:
            continue
        old = models.get(key)
        if old:
            for name in set(base) | set(old["basePrices"]):
                if abs(base.get(name, 0) - old["basePrices"].get(name, 0)) > 0.5:
                    differences.append((key, "base " + name, old["basePrices"].get(name), base.get(name)))
        guard_by_fans = sheet_guard["B" if material == "5B" else material]
        options = []
        for index, (oid, label, source) in enumerate(OPTIONS):
            code = DB_OPTION_MAP.get(oid)
            if code:
                price = values.get(code) or 0
                if oid == "DT_Electric_Reheat":
                    price *= fans
            elif oid == "DT_SS_Fan_Guard":
                price = guard_by_fans[fans][2]
            else:
                raise SystemExit(f"No price source for {oid}")
            options.append(round(price, 2) if price else 0)
            if old and abs((old["options"][index] or 0) - options[-1]) > 0.5:
                differences.append((key, oid, old["options"][index], options[-1]))
        entry = {"basePrices": base, "options": options}
        result[key] = entry
    return result, differences

def main(xlsx, out, database=None):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    sheet_additions = {}
    models = {}
    for sheet, material in SHEETS.items():
        ws = wb[sheet]
        by_fans = {}
        for r in range(109, 115):
            fans = ws.cell(r, 2).value
            by_fans[int(fans)] = [num(ws.cell(r, c).value) for c in (3, 4, 5)]
        sheet_additions[material] = (by_fans, {"H116": num(ws["H116"].value), "H118": num(ws["H118"].value), "H119": num(ws["H119"].value)})
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
                elif source[0] == "none":
                    price = 0
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
    if database:
        models, differences = apply_database(models, database, sheet_additions)
        print(len(differences), "price differences versus the price list sheets (database values used):")
        summary = {}
        for key, field, old, new in differences:
            summary.setdefault(field, []).append((key, old, new))
        for field, items in sorted(summary.items()):
            print(" ", field, len(items), "models, e.g.", items[0])
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.selectSgsDtProductPricing = " +
                json.dumps({"optionDefinitions": [{"id": o[0], "label": o[1], "uom": "per Unit"} for o in OPTIONS],
                            "models": models}, separators=(",", ":")) + ";\n")
    print(len(models), "models written to", out)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "dt-product-pricing.js",
         sys.argv[3] if len(sys.argv) > 3 else None)
