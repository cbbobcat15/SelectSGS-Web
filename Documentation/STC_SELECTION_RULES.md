# STC Evaporator Selection Rules

STC uses the evaporator design inputs and capacity-matching workflow used by BTR.

## Inputs

- Total Room Load (TR)
- Number of evaporators (integer of at least 1)
- Room temperature (°F; negative values are allowed)
- Target TD (°F; greater than zero)
- Capacity tolerance filters (defaults to -15% and +15%)

## Selection Process

1. Calculate target coil temperature as Room Temperature minus Target TD.
2. Select Wet ratings when target coil temperature is above 25°F; select Frosted ratings at or below 25°F.
3. Calculate required capacity per coil as `Room Load × 12,000 ÷ Target TD ÷ Number of Evaporators`.
4. Calculate capacity difference as `(rated capacity - required capacity per coil) / required capacity per coil × 100`.
5. Keep models within the selected capacity tolerance and, when room temperature is above 34°F, exclude face velocities above 630 FPM.
6. Exclude models that have no rating for the selected Wet or Frosted condition. Blank workbook cells are not inferred or filled.
7. Select a result row and add the model to the quote.

The STC ratings and engineering details are bundled in `stc-ratings.js` from the attached STC engineering data. Results include model, selected-condition capacity, capacity difference, face velocity, and fan horsepower. Pricing has not been provided; STC selections can be added to a quote, but quote totals and workbook export remain unavailable until STC pricing is added.
