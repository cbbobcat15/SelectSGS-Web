# STC Evaporator Selection Rules

STC uses the evaporator design inputs and capacity-matching workflow used by BTR.

## Inputs

- Total Room Load (TR)
- Number of evaporators (integer of at least 1)
- Room temperature (°F; negative values are allowed)
- Target TD (°F; greater than zero)
- Coil material (SS, AL, CU, or Steel HDG)
- R717 refrigerant feed (Recirculated / Flooded or DX)
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
9. Select a result row and add the model to the quote.

The STC ratings and correction factors are bundled in `stc-ratings.js` from the attached STC engineering data and correction-factor workbook. Results include catalog and corrected capacity, applied correction factor, capacity difference, face velocity, and fan horsepower. Pricing has not been provided; STC selections can be added to a quote, but quote totals and workbook export remain unavailable until STC pricing is added.
