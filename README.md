# SelectSGS-Web
Transferring SelectSGS into a web-based platform

**SelectSGS WEB**

**Purpose**

Create a modern web-based configurator, pricing, and quoting platform for SGS Products

**Goals**

    Replace current desktop application
    Improve speed and responsiveness
    Allow browser-based access
    Generate quotes automatically

**Products**

    Condensers - IEC & DTC
    Evaporators - PC, DT/DTX, BTR, STC, CF, FL
    Slab Coils

**Current workflow**

Serve the project from a local or hosted web server, then open `index.html` to enter project information, including the required sales territory. Once the required details are complete, an eight-row unit list appears; each “Click to Select” button opens `unit-selection.html` for that row, where IEC or DTC can be selected. Enter the design conditions, choose a matching unit, then choose “Add to Quote” to return to the project information page. IEC selections support R717 and R22; DTC ratings are available for R717 only. DTC ratings are sourced from the DTC tab in the engineering ratings workbook and bundled in `dtc-units.js`. IEC and DTC base-unit prices and model-specific option prices are bundled in `product-pricing.js`; keep both data files alongside their HTML pages when hosting the app. The quote page keeps project information and the item summary on the left, with selected-unit details above options on the right. Up to 12 model-specific options can be selected per unit. The multiplier defaults to 0.35 and applies to the base unit and each selected option; it accepts values greater than 0 through 1. Project, unit, option, and multiplier data are carried between these pages in the current browser tab.

Choose **Export Quote** in the Item Summary to download an `.xlsx` workbook populated from the bundled `quote-template.xlsx` attached to this project, with pricing on **Quote Page 0** and a separate condenser detail tab named **Item #_** for each selected item. Each unit's first pricing row keeps the template's merged description cell and lists **Line Item #**, **Location**, and **Model #** in that order, followed by its selected options; two blank rows separate units. The attached workbook is always used; keep `quote-template.xlsx` alongside `index.html` when hosting the app. The evaporator **Item E** tab is not included yet. IEC/DTC base and option prices from `product-pricing.js` are multiplied by the project cost multiplier before they appear in the quote.

Use **Add to project Tree** on the Project Information page to save the current project in the browser's Project Tree. The tree keeps multiple project and quote snapshots in browser storage; select any entry to switch projects. Changes to the selected project are saved automatically, and **New Project** starts another project without replacing the selected one. Use the single set of Up/Down, Archive/Restore, and Delete controls beneath **New Project** to manage the selected project; archived projects are available from the archived-projects list.