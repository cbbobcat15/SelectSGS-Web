 # IEC Selection Rules
**Inputs**
1. Capacity Requirements
2. Condensing Temperature
3. Wet Bulb Temperature
4. Refrigerant
5. Motor Voltage
6. Maximum number of cells (defaults to 99; minimum 1)

**Selection Process**
1. User Enters Design information
2. System calculates Correction factor based on DB and WB
3. User defines the maximum number of cells and percent above and below target capacity for results.
4. System calculates each model's corrected capacity per cell.
5. System identifies every model and cell count up to the maximum whose combined capacity is within the requested range.
6. System sorts qualifying solutions by total list price, lowest to highest.
7. System shows capacity as a percent +/- based on the combined corrected capacity versus design capacity.

**Outputs**

Results include model number, number of cells, total list price, capacity match, combined base and corrected HOR, airflow, fan motor, internal coil volume, and R717 charge.