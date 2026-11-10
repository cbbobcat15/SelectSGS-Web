(function () {
    const encoder = new TextEncoder();
    const crcTable = Array.from({ length: 256 }, (_, value) => {
        let crc = value;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
        return crc >>> 0;
    });

    function xmlEscape(value) {
        return String(value ?? "")
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    function columnName(index) {
        let name = "";
        while (index > 0) {
            const remainder = (index - 1) % 26;
            name = String.fromCharCode(65 + remainder) + name;
            index = Math.floor((index - 1) / 26);
        }
        return name;
    }

    function addCell(rows, rowNumber, column, value, style = 0) {
        if (!rows.has(rowNumber)) rows.set(rowNumber, new Map());
        rows.get(rowNumber).set(column, { value, style });
    }

    function addMergedText(rows, merges, row, startColumn, endColumn, value, style = 0) {
        addCell(rows, row, startColumn, value, style);
        if (endColumn > startColumn) {
            merges.push(`${columnName(startColumn)}${row}:${columnName(endColumn)}${row}`);
        }
    }

    function worksheetXml(rows, merges, widths, pageSetup = {}) {
        const rowXml = [...rows.entries()]
            .sort(([a], [b]) => a - b)
            .map(([rowNumber, cells]) => {
                const cellXml = [...cells.entries()]
                    .sort(([a], [b]) => a - b)
                    .map(([column, cell]) => {
                        const reference = `${columnName(column)}${rowNumber}`;
                        const style = ` s="${cell.style}"`;
                        if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
                            return `<c r="${reference}"${style}><v>${cell.value}</v></c>`;
                        }
                        return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`;
                    })
                    .join("");
                return `<row r="${rowNumber}">${cellXml}</row>`;
            })
            .join("");
        const cols = widths.map((width, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
        ).join("");
        const mergeXml = merges.length
            ? `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
            : "";
        const rowBreaks = pageSetup.rowBreaks?.length
            ? `<rowBreaks count="${pageSetup.rowBreaks.length}" manualBreakCount="${pageSetup.rowBreaks.length}">${pageSetup.rowBreaks.map(id => `<brk id="${id}" max="16383" man="1"/>`).join("")}</rowBreaks>`
            : "";
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rowXml}</sheetData>
${mergeXml}
<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
${rowBreaks}
</worksheet>`;
    }

    function makeQuoteSheet(project, units, costMultiplier, exportDate) {
        const rows = new Map();
        const merges = [];
        addCell(rows, 1, 4, "SPX Cooling Tech, LLC", 1);
        addCell(rows, 2, 4, "827 West Progress Drive", 0);
        addCell(rows, 3, 4, "Dixon, IL 61021", 0);
        addCell(rows, 4, 4, "Phone (815) 284-2700   Fax (815) 288-0807", 0);
        addCell(rows, 7, 2, "Customer:", 3);
        addMergedText(rows, merges, 7, 3, 6, project.customer, 4);
        addCell(rows, 7, 8, "Contact:", 3);
        addMergedText(rows, merges, 7, 9, 12, project.contact, 4);
        addCell(rows, 8, 2, "Project Name:", 3);
        addMergedText(rows, merges, 8, 3, 6, project.projectName, 4);
        addCell(rows, 8, 8, "Prepared by:", 3);
        addMergedText(rows, merges, 8, 9, 12, project.preparedBy, 4);
        addCell(rows, 9, 2, "Quote #:", 3);
        addMergedText(rows, merges, 9, 3, 6, project.quoteNumber, 4);
        addCell(rows, 9, 8, "Date:", 3);
        addMergedText(rows, merges, 9, 9, 12, exportDate, 4);
        addCell(rows, 11, 1, "QTY", 5);
        addMergedText(rows, merges, 11, 2, 8, "PART DESCRIPTION / NOTES", 5);
        addMergedText(rows, merges, 11, 9, 10, "NET EACH $", 5);
        addMergedText(rows, merges, 11, 11, 12, "EXTENDED $", 5);

        let row = 13;
        let total = 0;
        for (const unit of units) {
            const basePrice = Number(unit.baseNetPrice) || 0;
            const baseDescription = [
                `Evaporative Condenser - ${unit.model}`,
                unit.location ? `Location: ${unit.location}` : "",
                unit.tag ? `Unit Tag: ${unit.tag}` : "",
                `${Number(unit.requiredCapacity).toLocaleString()} MBH - ${unit.refrigerant}`
            ].filter(Boolean).join(" | ");
            addCell(rows, row, 1, 1, 8);
            addMergedText(rows, merges, row, 2, 8, baseDescription, 10);
            addMergedText(rows, merges, row, 9, 10, basePrice, 9);
            addMergedText(rows, merges, row, 11, 12, basePrice, 9);
            total += basePrice;
            row++;

            for (const option of (unit.options ?? []).filter(item => item.optionId)) {
                const name = option.optionId === "hdg-internal-service-platform"
                    ? "HDG Internal Service Platform"
                    : option.optionId;
                const quantity = Number(option.quantity) || 1;
                const netEach = Number(option.netEachPrice) || 0;
                const extended = quantity * netEach;
                addCell(rows, row, 1, quantity, 8);
                addMergedText(rows, merges, row, 2, 8, name, 10);
                addMergedText(rows, merges, row, 9, 10, netEach, 9);
                addMergedText(rows, merges, row, 11, 12, extended, 9);
                total += extended;
                row++;
            }
        }

        const totalRow = Math.max(63, row + 1);
        addCell(rows, totalRow, 1, "Estimated Lead Time:", 3);
        addCell(rows, totalRow, 4, "Select", 4);
        addMergedText(rows, merges, totalRow, 9, 10, "Total:", 11);
        addMergedText(rows, merges, totalRow, 11, 12, total, 12);
        addMergedText(rows, merges, totalRow + 1, 1, 12, "Quoted price is good for 30 days from today's date; freight and taxes not included.", 0);
        addMergedText(rows, merges, totalRow + 2, 1, 12, "Evaporative Condenser Product: All Prices FOB Dixon, IL.", 0);
        addMergedText(rows, merges, totalRow + 3, 1, 12, "Unit specifications are listed on the Item EC tab.", 0);
        addMergedText(rows, merges, totalRow + 4, 1, 12, "Pricing reflects the current $1.00 unit and $0.00 option list-price placeholders.", 0);
        return worksheetXml(rows, merges, Array(12).fill(9.71));
    }

    function makeItemEcSheet(project, units, exportDate) {
        const rows = new Map();
        const merges = [];
        const rowBreaks = [];
        const addEcField = (row, label, value, unit = "") => {
            addMergedText(rows, merges, row, 1, 3, label, 2);
            addCell(rows, row, 4, value ?? "N/A", 3);
            if (unit) addCell(rows, row, 5, unit, 2);
        };
        const addEcPair = (row, leftLabel, leftValue, rightLabel, rightValue) => {
            addMergedText(rows, merges, row, 1, 2, leftLabel, 2);
            addMergedText(rows, merges, row, 3, 4, leftValue ?? "N/A", 3);
            if (rightLabel) {
                addMergedText(rows, merges, row, 7, 8, rightLabel, 2);
                addMergedText(rows, merges, row, 9, 10, rightValue ?? "N/A", 3);
            }
        };

        units.forEach((unit, index) => {
            const offset = index * 48;
            const row = base => base + offset;
            addCell(rows, row(1), 4, "SPX Cooling Tech, LLC", 1);
            addCell(rows, row(2), 4, "827 West Progress Drive", 0);
            addCell(rows, row(3), 4, "Dixon, IL 61021", 0);
            addCell(rows, row(4), 4, "Phone (815) 284-2700   Fax (815) 288-0808", 0);
            addCell(rows, row(6), 1, "Evaporative Condenser Specification Sheet", 6);

            const projectFields = [
                ["Customer:", project.customer],
                ["Project Name:", project.projectName],
                ["Quote #:", project.quoteNumber],
                ["Unit Location:", unit.location],
                ["Unit Tag:", unit.tag]
            ];
            projectFields.forEach(([label, value], fieldIndex) => {
                const fieldRow = row(8 + fieldIndex);
                addCell(rows, fieldRow, 2, label, 2);
                addMergedText(rows, merges, fieldRow, 3, 5, value, 4);
            });

            for (const [sectionRow, title] of [
                [14, "DESIGN CONDITIONS"],
                [21, "ACTUAL CAPACITY"],
                [28, "EVAPORATIVE CONDENSER DESCRIPTION"]
            ]) {
                addMergedText(rows, merges, row(sectionRow), 1, 9, title, 7);
            }

            addEcField(row(16), "Total Heat Rejection Required", unit.requiredCapacity, "MBH");
            addEcField(row(17), "Condensing Temperature", unit.condensingTemperature, "°F");
            addEcField(row(18), "Wet Bulb Temperature", unit.wetBulbTemperature, "°F");
            addEcField(row(19), "Refrigerant", unit.refrigerant);
            addEcField(row(23), "Total Heat Rejection", unit.correctedHor, "MBH");
            addEcField(row(24), "Number of Cells", "N/A");
            addEcField(row(25), "Heat Rejection/cell", "N/A", "MBH");

            const fanMotor = String(unit.fanMotor ?? "").match(/^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
            const fansPerCell = fanMotor ? Number(fanMotor[1]) : "N/A";
            const fanHp = fanMotor ? Number(fanMotor[2]) : "N/A";
            const fanHpPerCell = fanMotor ? fansPerCell * fanHp : "N/A";
            const descriptionFields = [
                [30, "Product", "IEC", "Number of Fans/cell", fansPerCell],
                [31, "Model Number", unit.model, "Fan Motor HP/Fan", fanHp],
                [32, "Number of Cells", "N/A", "Fan Motor HP/Cell", fanHpPerCell],
                [33, "Number of Circuits/cell", "N/A", "Fan Motor HP Total", "N/A"],
                [34, "Motor Voltage", unit.motorVoltage, "Pump HP/cell", "N/A"],
                [35, "R717 Charge (lb)", unit.r717ChargeLb ?? "N/A", "Pump GPM/cell", "N/A"],
                [36, "Air Flow Rate", unit.airFlowCfm ?? "N/A", "", ""],
                [37, "Air Flow Rate/cell", "N/A", "", ""]
            ];
            descriptionFields.forEach(([baseRow, leftLabel, leftValue, rightLabel, rightValue]) => {
                const currentRow = row(baseRow);
                addMergedText(rows, merges, currentRow, 1, 2, leftLabel, 2);
                addMergedText(rows, merges, currentRow, 3, 4, leftValue ?? "N/A", 3);
                if (rightLabel) {
                    addMergedText(rows, merges, currentRow, 7, 8, rightLabel, 2);
                    addMergedText(rows, merges, currentRow, 9, 10, rightValue ?? "N/A", 3);
                }
            });

            addMergedText(rows, merges, row(39), 1, 3, "Per Cell Dimension and Weight", 7);
            addMergedText(rows, merges, row(39), 7, 9, "Total Dimension and Weight", 7);
            addEcPair(row(40), "Shipping Weight(lbs)", "N/A", "Shipping Weight(lbs)", "N/A");
            addEcPair(row(41), "Heaviest Sec Weight(lbs)", "N/A", "", "");
            addEcPair(row(42), "Max Operating Weight(lbs)", "N/A", "Max Operating Weight(lbs)", "N/A");
            addEcPair(row(43), "Width(ft)", "N/A", "Width(ft)", "N/A");
            addEcPair(row(44), "Length(ft)", "N/A", "Length(ft)", "N/A");
            addEcPair(row(45), "Height(ft)", "N/A", "", "");
            if (index < units.length - 1) rowBreaks.push(row(47));
        });

        return worksheetXml(rows, merges, [
            11.29, 18, 10.86, 12.14, 7.71, 8.86, 11, 17.43, 13.71, 6.29, 13.14
        ], { rowBreaks });
    }

    function stylesXml() {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red](&quot;$&quot;#,##0.00)"/></numFmts>
<fonts count="4">
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="16"/><name val="Arial"/></font>
<font><b/><sz val="10"/><name val="Arial"/></font>
<font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD6D6D6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE3BC8D"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF004F9F"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE9EDF1"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FF8797A5"/></left><right style="thin"><color rgb="FF8797A5"/></right><top style="thin"><color rgb="FF8797A5"/></top><bottom style="thin"><color rgb="FF8797A5"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="medium"><color rgb="FF53677A"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="13">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="2" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="5" borderId="2" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="2" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
    }

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (const byte of bytes) {
            crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function write16(view, offset, value) {
        view.setUint16(offset, value, true);
    }

    function write32(view, offset, value) {
        view.setUint32(offset, value >>> 0, true);
    }

    function zipFiles(files) {
        const localParts = [];
        const centralParts = [];
        let localOffset = 0;
        const date = new Date();
        const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
        const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

        for (const [name, content] of files) {
            const filename = encoder.encode(name);
            const bytes = encoder.encode(content);
            const checksum = crc32(bytes);
            const localHeader = new Uint8Array(30 + filename.length);
            const localView = new DataView(localHeader.buffer);
            write32(localView, 0, 0x04034b50);
            write16(localView, 4, 20);
            write16(localView, 6, 0x0800);
            write16(localView, 8, 0);
            write16(localView, 10, dosTime);
            write16(localView, 12, dosDate);
            write32(localView, 14, checksum);
            write32(localView, 18, bytes.length);
            write32(localView, 22, bytes.length);
            write16(localView, 26, filename.length);
            write16(localView, 28, 0);
            localHeader.set(filename, 30);
            localParts.push(localHeader, bytes);

            const centralHeader = new Uint8Array(46 + filename.length);
            const centralView = new DataView(centralHeader.buffer);
            write32(centralView, 0, 0x02014b50);
            write16(centralView, 4, 20);
            write16(centralView, 6, 20);
            write16(centralView, 8, 0x0800);
            write16(centralView, 10, 0);
            write16(centralView, 12, dosTime);
            write16(centralView, 14, dosDate);
            write32(centralView, 16, checksum);
            write32(centralView, 20, bytes.length);
            write32(centralView, 24, bytes.length);
            write16(centralView, 28, filename.length);
            write16(centralView, 30, 0);
            write16(centralView, 32, 0);
            write16(centralView, 34, 0);
            write16(centralView, 36, 0);
            write32(centralView, 38, 0);
            write32(centralView, 42, localOffset);
            centralHeader.set(filename, 46);
            centralParts.push(centralHeader);
            localOffset += localHeader.length + bytes.length;
        }

        const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        write32(endView, 0, 0x06054b50);
        write16(endView, 4, 0);
        write16(endView, 6, 0);
        write16(endView, 8, files.length);
        write16(endView, 10, files.length);
        write32(endView, 12, centralSize);
        write32(endView, 16, localOffset);
        write16(endView, 20, 0);
        return new Blob([...localParts, ...centralParts, end], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
    }

    function exportQuoteWorkbook({ project, units, costMultiplier }) {
        if (!Array.isArray(units) || units.length === 0) {
            throw new Error("Add at least one unit before exporting the quote.");
        }

        const exportDate = new Date().toISOString().slice(0, 10);
        const files = [
            ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`],
            ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
            ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0" firstSheet="0"/></bookViews>
<sheets><sheet name="Quote Page 0" sheetId="1" r:id="rId1"/><sheet name="Item EC" sheetId="2" r:id="rId2"/></sheets>
</workbook>`],
            ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
            ["xl/styles.xml", stylesXml()],
            ["xl/worksheets/sheet1.xml", makeQuoteSheet(project, units, costMultiplier, exportDate)],
            ["xl/worksheets/sheet2.xml", makeItemEcSheet(project, units, exportDate)]
        ];
        const blob = zipFiles(files);
        const anchor = document.createElement("a");
        const quoteName = String(project.quoteNumber || project.projectName || "SelectSGS-Quote")
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
            .trim() || "SelectSGS-Quote";
        const objectUrl = URL.createObjectURL(blob);
        anchor.href = objectUrl;
        anchor.download = `SelectSGS-${quoteName}.xlsx`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }

    window.exportQuoteWorkbook = exportQuoteWorkbook;
})();
