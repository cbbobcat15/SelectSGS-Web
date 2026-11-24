# STC Evaporator Selection Rules

STC uses the evaporator design inputs and capacity-matching workflow used by BTR.

## Inputs

- Total Room Load (TR)
- Number of evaporators (integer of at least 1)
- Room temperature (°F; negative values are allowed)
- Target TD (°F; greater than zero)
- Coil material (SS, AL, CU, or Steel HDG)
- Defrost type (A-Air, HGC-Hot Gas Coil Only, or HTS-Hot Gas Unit (Series))
- R717 refrigerant feed (Recirculated, Flooded, or DX; Recirculated and Flooded use the same ratings but are kept separate for the model number)
- Capacity tolerance filters (defaults to -15% and +15%)

## Selection Process

1. Calculate target coil temperature as Room Temperature minus Target TD.
2. Select Wet ratings when target coil temperature is above 25°F; select Frosted ratings at or below 25°F.
3. Calculate required capacity per coil as `Room Load × 12,000 ÷ Target TD ÷ Number of Evaporators`.
4. Multiply the catalog rating by each applicable capacity correction factor before matching:
   - Wet Coil to 32°F SST: 4/6/8 rows use 1.13/1.12/1.10.
   - R717 Ammonia (NHS) DX to 0°F SST: 4/6/8 rows use 0.75/0.83/0.84 when DX is selected.
   - Steel HDG Recirculated / Flooded: 4/6/8 rows use 0.87/0.88/0.90 when Steel HDG is selected with Recirculated / Flooded feed.
5. Multiply all applicable factors together. SS, AL, and CU use the catalog ratings without a material adjustment. The provided table has no Steel HDG + DX correction, so that combination is unavailable.
6. Calculate capacity difference as `(corrected capacity - required capacity per coil) / required capacity per coil × 100`.
7. Keep models within the selected capacity tolerance and, when room temperature is above 34°F, exclude face velocities above 630 FPM.
8. Exclude models that have no rating for the selected Wet or Frosted condition. Blank workbook cells are not inferred or filled.
9. Select a result row and add the model to the quote. The selected defrost type determines the base price; A and HGC share the `A/HGC` price, while HTS uses its own price.

The STC ratings and correction factors are bundled in `stc-ratings.js` from the attached STC engineering data and correction-factor workbook. Results show Model, Coil Cap (BTUH/TD, corrected), Cap % Diff, Face Vel (FPM), CFM, Fan HP and List Price. Correction factors are still applied to capacity but are not shown. STC selection requires a defrost type before results appear: A-Air, HGC-Hot Gas Coil Only, or HTS-Hot Gas Unit (Series). A and HGC use the shared `A/HGC` base price; HTS uses the `HTS` base price. STC base and option prices are bundled in `stc-product-pricing.js`. Selecting a result row enables Add to Quote, which returns the unit to the project information page. Options match the BTR layout: a drain pan selector (Standard, Insulated Pan Cover, SS Pan Cover), six selectable options (SS Casing, Gold Epoxy Pre-Coated Fins, and the SS Fan Guard that matches the unit's fan diameter: 24" or 30"), and three write-in rows, all priced per Unit and multiplied by the project cost multiplier.


STC prices are generated from the SGS price list workbook with `python3 -I tools/generate-stc-pricing.py PRICE_LIST.xlsx stc-product-pricing.js`. SS Casing, Insulated Pan Cover and SS Pan Cover prices depend only on coil material, number of fans and fan diameter, so each group's price applies to every model in it. The SS Pan Cover price is the Insulated Pan Cover price plus the SS Pan Cover price. SS fan guards are priced per unit by number of fans, per coil material.
