# CF Evaporator Selection Rules

CF (centrifugal fan) evaporators use the same inputs, results table and quote flow as STC.

## Inputs

- Total Room Load (TR), number of evaporators, room temperature and target TD (same as STC)
- Refrigerant: R717 only
- Coil material: SS, AL, CU or Steel HDG
- Defrost type: A, HGC, HGS, HGP, ED or EDL
- Refrigerant feed: RB, RT, FL or DX
- ESP (0", 0.25" or 0.5")
- Results filters: capacity tolerance (default -15% / +15%), FPI (All, 3 or 4) and Tube Diameter (All, 3/4" or 1")

DX, HGC, ED and EDL are available on 3/4" tube coils only (per the CF selection nomenclature), so 1" tube units are left out of the results when those or copper are selected. Copper is only priced for 3/4" tube coils. WD is not offered because the price list has no WD prices.

## Selection process

1. Target coil temperature = room temperature - target TD. Above 30°F the coil is **wet**; at or below 30°F it is **frosted** (Table 2).
2. Required capacity per coil = `Room Load x 12,000 / Target TD / Number of Evaporators`.
3. The catalogue rating (BTUH/°F TD at the selected tube, ESP, motor HP and FPI) is multiplied by:
   - Table 2, using each unit's face velocity: frosted interpolates 500-800 FPM; wet uses the 4 FPI column (also used for 3 FPI) and interpolates 400-600 FPM. Values outside the range use the nearest end.
   - Table 1, Ammonia TEV to 0°F SST (rows 6/8/10/12 = 0.83/0.84/0.85/0.85) whenever DX is selected, at any SST.
4. Cap % Diff = `(corrected capacity - required) / required x 100`; keep results inside the tolerance. When room temperature is above 34°F, face velocities above 630 FPM are excluded.
5. Units with no price for the selected tube, material and defrost type are not offered.

Variable fin spacing (Table 1) is not offered, and 6 FPI has no performance data.

## Data and pricing

- `cf-ratings.js` (ratings, correction factors, dimensions) is rebuilt with `python3 -I tools/generate-cf-ratings.py PERFORMANCE.xlsx CORRECTIONS.xlsx SGS-CF-TECH-20.pdf cf-ratings.js`. Length/width/height come from page 37 of the CF technical PDF (the 3C-59 height is corrected to 60").
- `cf-product-pricing.js` is rebuilt with `python3 -I tools/generate-cf-pricing.py PRICE_LIST.xlsx cf-product-pricing.js` from the CFA/CFB/CFC/CFS sheets and "CF FL Std Mtr Adds".
- List price = base price for the defrost type (A/HGC, HGS/HGP, ED or EDL) at the row's standard motor HP, plus the motor adder (standard HP to selected HP) multiplied by the number of fans. Blank option cells apply to the whole block of rows for that coil and FPI.

## Quote page

Options match STC/BTR: a drain pan selector, ten selectable options and three write-in rows, all per unit and multiplied by the cost multiplier.

- A, HGC and ED: Standard, Insulated Pan Cover (Mill Galv.) or Insulated Pan Cover (SS); either insulated cover changes the defrost code to IA, IHGC or IED.
- HGS, HGP and EDL: the standard pan includes a mill galvanized insulated cover; SS Pan Cover is the upgrade.
- Other options: SS Casing, Heat Tape in Drain Pan Cover, 24" Extended Legs, Discharge Duct Adapter, Flat Filter Section, Throw Away Filters, 2-Way Louvers, Gold Epoxy Fins, Electrofin and Heresite (coatings are not priced for steel).

Model number: `CF<tube><material><fans><fan size>-<face area><rows>-<FPI>-<motor HP>-<feed><refrigerant>-<defrost>`, for example `CFDA2G-3310-4-7.5-RBA-HGS`; Electrofin and Heresite add `-EF` or `-HC`. Coil weight is the steel weight for Steel HDG and the aluminum weight for other materials.
