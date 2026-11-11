# DTC Selection Rules

## Inputs

1. Required capacity in MBH
2. Condensing temperature
3. Wet bulb temperature
4. Refrigerant (R717 only)
5. Motor voltage
6. Lower and upper capacity tolerances

## Selection Process

1. User enters design information and selects the DTC product line.
2. The system calculates the correction factor from condensing and wet bulb temperatures using the same correction table and interpolation as IEC.
3. Each DTC model's corrected heat rejection is its engineering-data Base HOR divided by the correction factor.
4. The system lists models whose corrected heat rejection falls within the requested capacity tolerance.
5. Results can be sorted by model, nominal size, rated R717 tons, capacity match, Base HOR, corrected HOR, airflow, fan motor power, internal coil volume, or R717 charge.

## Data Source

The model ratings and nominal sizes in `dtc-units.js` are taken from the DTC tab of the engineering ratings workbook. DTC ratings on that tab are for R717.

