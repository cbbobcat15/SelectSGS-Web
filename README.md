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

Open `index.html` to enter project information, including the required sales territory. Once the required details are complete, an eight-row unit list appears; each “Click to Select” button opens `unit-selection.html` for that row. Click a matching unit to highlight it, then choose “Add to Quote” to return to the project information page. The quote page keeps project information and the item summary on the left, with selected-unit details above options on the right. IEC unit options provide 12 independently selectable lines. Added units default to a $1.00 list-price placeholder; item summary net prices are calculated as unit list price times the project cost multiplier plus the net price of selected options. The multiplier defaults to 0.35 and accepts values greater than 0 through 1. The HDG Internal Service Platform option currently has a temporary $0.00 list-price placeholder. Project, unit, option, and multiplier data are carried between these pages in the current browser tab.

Choose **Export Excel Quote** in the Item Summary to download an `.xlsx` workbook formatted to follow the provided quote template, with pricing on **Quote Page 0** and evaporative condenser specifications on **Item EC**. Each condenser's base price has its own line, with each selected option listed beneath it on an indented line. The evaporator **Item E** tab is not included yet. Exported prices use the current $1.00 unit and $0.00 option list-price placeholders.

Use **Add to project Tree** on the Project Information page to save the current project in the browser's Project Tree. The tree keeps multiple project and quote snapshots in browser storage; select any entry to switch projects. Changes to the selected project are saved automatically, and **New Project** starts another project without replacing the selected one. Use the single set of Up/Down, Archive/Restore, and Delete controls beneath **New Project** to manage the selected project; archived projects are available from the archived-projects list.