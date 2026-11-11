# DTC Selection Rules

## Inputs

1. Required capacity in MBH
2. Condensing temperature
3. Wet bulb temperature
4. Refrigerant (R717 only)
5. Motor voltage
6. Lower and upper capacity tolerances
7. Maximum number of cells (defaults to 99; minimum 1)

## Selection Process

1. User enters design information and selects the DTC product line.
2. The system calculates the correction factor from condensing and wet bulb temperatures using the same correction table and interpolation as IEC.
3. Each DTC model's corrected heat rejection per cell is its engineering-data Base HOR divided by the correction factor.
4. The system lists each model and cell count up to the maximum whose combined corrected heat rejection falls within the requested capacity tolerance.
5. Results are sorted by combined list price, lowest to highest, by default.
6. Results can also be sorted by model, nominal size, number of cells, rated R717 tons, capacity match, list price, Base HOR, corrected HOR, airflow, fan motor power, internal coil volume, R717 charge, shipping weight, heaviest section weight, or operating weight. Shipping and operating weights and rated capacity are totals across the selected cells; heaviest section weight is the weight of the largest individual section.

## Data Source

The model ratings and nominal sizes in `dtc-units.js` are taken from the DTC tab of the engineering ratings workbook. DTC ratings on that tab are for R717.
