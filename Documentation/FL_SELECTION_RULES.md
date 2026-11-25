# FL Evaporator Selection Rules

FL (floor-mounted centrifugal fan) evaporators follow the CF workflow exactly; see [CF Selection Rules](./CF_SELECTION_RULES.md). Differences:

- Ratings, physical data and dimensions come from the FL performance workbook and SGS-FL-TECH-20 (`fl-ratings.js`, rebuilt with `python3 -I tools/generate-fl-ratings.py PERFORMANCE.xlsx CORRECTIONS.xlsx SGS-FL-TECH-20.pdf fl-ratings.js`). The correction factors are the same CF/FL Table 1 and Table 2 values.
- Defrost types: A, HGC, HGS, HGP, WD, ED and EDL. Water defrost (WD) is priced on the FL sheets and is available on both tube sizes; HGC, ED, EDL, DX and copper remain 3/4" tube only. WD units have no pan cover options.
- Pricing is in `fl-product-pricing.js` (`python3 -I tools/generate-fl-pricing.py PRICE_LIST.xlsx fl-product-pricing.js`). FL has no 24" Extended Legs, Flat Filter Section or Throw Away Filters options, so it offers seven non-coating options plus the three coatings (ten selectable rows, three write-ins).
- Dimensions (page 37): Length = L, Width = D (unit depth) and Height = H. The PDF adds 20" to the height for a top-mounted motor; the table value is used as printed.
- Model number: `FL<tube><material><fans><fan size>-<face area><rows>-<FPI>-<motor HP>-<feed><refrigerant>-<defrost>`, for example `FLEA2H-466-3-7.5-RBA-HGS`.

## Price list issue

On the FLA (aluminum) price sheet, the Heat Tape, Discharge Duct Adapter and 2-Way Louvers columns are wrong on every block: the duct adapter and louver cells repeat the Gold Epoxy and Electrofin prices (louvers about $14,000) and the Heat Tape cell holds the louver price. The FLB (stainless) and FLC (copper) sheets list identical values for these three options, so aluminum uses the FLB prices until the price list is corrected.
