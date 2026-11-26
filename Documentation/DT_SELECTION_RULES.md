# DT/DTX Evaporator Selection Rules

DT/DTX (draw-through unit coolers, 1–6 fans, 22" propeller fans at 1140 RPM) use the same workflow as the other evaporators: Total Room Load, # of Evaps, Room Temp and Target TD, then the DT/DTX dropdowns, then Find Units with Cap % Under/Over filters. Source data is ES 14602.6 (`DT_Information.pdf`) and the SGS price list, sheets DTDS/DTXDS (steel), DTDC/DTXDC (copper), DTDA/DTXDA (aluminum) and DTDB/DTXDB (stainless).

## Selections

- Refrigerant: R717, R22, R404A or R507. Copper tube coils cannot be used with ammonia (PDF 4.2), so R717 offers SS, AL and Steel HDG, and the halocarbons offer CU only. Capacities are the same steel/copper table values (PDF note: use the copper tube capacities for R-22/404A/507A).
- Defrost type: A, HGC, HGS/HGP (waffle pan, series/parallel), HTS/HTP (tube pan, series/parallel), WD (6 row units only) and ED/EDL (not offered on steel coils). Units without a price for the chosen material and defrost type are not offered.
- Refrigerant feed: RB, RT, FL, or DX. DX uses the DX rating columns; RB, RT and FL use the REC (recirculated/flooded) columns.
- Reheat Coil: None or HGR (hot gas reheat), the same process as the BTR. The coil is rated with the selected rows, and the unit is the same model with two more rows, so air flow, face velocity (and the 630 FPM limit), surface area, volume, weight and the price come from that model; the results show `DT-5-1034/2` and `6+2` rows. The additional set of headers (Add_Head_HGR, REHEAT_CODE = HGR in the database) is added automatically as a required, locked option line. HGR is offered for AL, SS and CU coils, and is unavailable for 8-row coils and 6 FPI coils because the data has no 10-row or 8-row 6 FPI models (and WD is priced for 6-row units only). Electric reheat cannot be combined with it.
- ESP is 0" only (ratings are for 0" ESP) and there is no ESP selection. Tube is 3/4" for every material except stainless, which is also offered with 5/8" tube (Tube Diameter results filter).
- Results filters: FPI (3, 4, 6), Rows Deep (6, 8) and Series (DT, DTX), Tube Diameter (3/4", 5/8") and the capacity tolerances. Default sort is List Price ascending; every column sorts.

## Capacity

- Coil temperature = Room Temp − Target TD. At 25°F and above the WET ratings are used; below 25°F the Frosted ratings (PDF 1.8.7). Suction temperatures below −50°F are not supported.
- Capacity per 1°F TD is compared with `Room Load × 12,000 ÷ Target TD ÷ # of Evaps`.
- Section 1.6 low suction temperature factor applies to DX-frosted ratings only: 1.0 down to −20°F, then linear through 0.9 at −30°F, 0.8 at −40°F and 0.7 at −50°F (for example 0.85 at −35°F). REC frosted ratings are rated to −50°F and are not corrected. The factor is interpolated linearly from −20°F rather than stepped by range, based on the PDF note that gives 0.85 at −35°F.
- When room temperature is above 34°F, units over 630 FPM face velocity are excluded (same rule as the other evaporators). A note appears when Target TD is above 20°F because the ratings are valid for TDs of 20°F or less.
- 5/8" stainless tube units (PDF pp. 13–14, model key tube letter C, for example `DTXCB2-621-RBA-A`) are offered. The PDF says their air flow, face velocity and surface area are copied from the 3/4" coil and need factory review, so the results panel shows a note whenever 5/8" units are listed.

## Pricing and options

- Base prices are per model and defrost type from the SelectSGS database workbook (`tbl_PRICE_TABLE_NEW`; they equal the price list) (no motor adders; 1/3 and 1/2 HP units are separate models). Options are per Unit: drain pan covers (insulated, hygienic), SS casing, coatings (gold epoxy, Electrofin, Heresite), two-speed and inverter-duty motors, heat tape (separate 115 V and 230 V options), long throw adapter, SS fan guard and belly band, brass distributor (steel coils only), mounted TEV (copper DX only), coil end covers (ED, EDL and WD), electric reheat (6 row AL/CU units, priced per fan section) and the additional hot gas reheat headers (AL/CU).
- Drain pan selector: A/HGC/ED offer the insulated SS cover or hygienic cover (the model number becomes IA/IHGC/IED); HGS/HGP/HTS/HTP/EDL include a mill galvanized insulated cover and can upgrade to the hygienic cover; WD has no cover options.
- Electrofin and Heresite are not offered with ED/EDL (only gold epoxy fins are compatible with defrost heaters).
- Twelve selectable option rows, plus the drain pan row and three write-ins.

## Model number

`<DT|DTX><D (3/4") or C (5/8")><material><fans>-<capacity>-<feed><refrigerant>-<defrost><reheat><coating>`, for example `DTXDA6-2181-RBA-HGS-HGR-EF`. Material is S (steel), A (aluminum), C (copper) or B (stainless); refrigerant is A (R717), V (R22), S (R404A) or P (R507); reheat is -ERH or -HGR (the HGR reheat coil also appends /2 to the capacity digits, e.g. `DTDA5-1034/2-RBA-A-HGR`); coating is -EF, -HC or -GF. Coil connection hand is not a selection input and is omitted.

## Dimensions

Length by fan count (52.375, 80.38, 108.5, 136.25, 164.25, 192.25 in), depth 41.25 in and height 39.75 in (DT) or 48.25 in (DTX) come from the PDF section 2.1 drawings. The PDF adds 5" of height for water defrost and 1" for the insulated cover; the table values are used as printed.

## Data files

- `dt-ratings.js`: `python3 -I tools/generate-dt-ratings.py DT_DTX_Unit_Data_Tables.xlsx dt-ratings.js` (the workbook transcribed from PDF pages 9–14).
- `dt-product-pricing.js`: `python3 -I tools/generate-dt-pricing.py PRICE_LIST.xlsx dt-product-pricing.js SELECTSGS_DATABASE.xlsx`. All DT/DTX prices (3/4" and 5/8" models) come from the database workbook (`tbl_PRICE_TABLE_NEW`); base prices equal the price list. Option prices follow the database: heat tape, long throw adapter and gold epoxy are model prices that already include the fan count, electric reheat is 2,732 per fan section and the extra hot gas reheat headers are 1,650. The SS fan guard and belly band price is not in the database and still comes from the price list. Blow thru (BT/BTX) is a separate product line and is not offered as a DT/DTX option. The generator prints every difference from the price list sheets.

Known PDF issues carried as printed: model 3-720 (DTX) lists "2 x 1/3" fans (the fan count is taken from the model number, 3); face area and coil volume for 5-1270 and 6-1530 look rounded; 6-1441 face velocity does not match CFM ÷ face area.
