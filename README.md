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

Open `index.html` to enter project information, including the required sales territory. Once the required details are complete, an eight-row unit list appears; each “Click to Select” button opens `unit-selection.html` for that row. Click a matching unit to highlight it, then choose “Add to Quote” to return to the project information page. The quote page places project information and the item summary on the left, with selected-unit specifications and options on the right. Added units default to $1.00. The HDG Internal Service Platform option currently has a temporary $0.00 list-price placeholder; its net price uses the project cost multiplier, which defaults to 0.35 and accepts values greater than 0 through 1. Project, unit, option, and multiplier data are carried between these pages in the current browser tab.