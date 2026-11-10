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

    function addPair(rows, merges, row, leftLabel, leftValue, rightLabel, rightValue, styles = {}) {
        addMergedText(rows, merges, row, 1, 2, leftLabel, 3);
        addMergedText(rows, merges, row, 3, 4, leftValue, styles.leftValue ?? 4);
        addMergedText(rows, merges, row, 5, 6, rightLabel, 3);
        addMergedText(rows, merges, row, 7, 8, rightValue, styles.rightValue ?? 4);
    }

    function worksheetXml(rows, merges, widths) {
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
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="20"/>
<cols>${cols}</cols>
<sheetData>${rowXml}</sheetData>
${mergeXml}
<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
    }

    function makeQuoteSheet(project, units, costMultiplier, exportDate) {
        const rows = new Map();
        const merges = [];
        addMergedText(rows, merges, 1, 1, 12, "SPX Cooling Tech, LLC", 1);
        addMergedText(rows, merges, 2, 1, 12, "827 West Progress Drive, Dixon, IL 61021", 0);
        addMergedText(rows, merges, 3, 1, 12, "Phone (815) 284-2700   Fax (815) 288-0807", 0);
        addMergedText(rows, merges, 5, 1, 12, "QUOTE PAGE 0 - PRICING", 2);

        addMergedText(rows, merges, 6, 1, 2, "Customer", 3);
        addMergedText(rows, merges, 6, 3, 8, project.customer, 4);
        addMergedText(rows, merges, 6, 9, 10, "Contact", 3);
        addMergedText(rows, merges, 6, 11, 12, project.contact, 4);
        addMergedText(rows, merges, 7, 1, 2, "Project Name", 3);
        addMergedText(rows, merges, 7, 3, 8, project.projectName, 4);
        addMergedText(rows, merges, 7, 9, 10, "Prepared By", 3);
        addMergedText(rows, merges, 7, 11, 12, project.preparedBy, 4);
        addMergedText(rows, merges, 8, 1, 2, "Quote #", 3);
        addMergedText(rows, merges, 8, 3, 4, project.quoteNumber, 4);
        addMergedText(rows, merges, 8, 5, 6, "Date", 3);
        addMergedText(rows, merges, 8, 7, 8, exportDate, 4);
        addMergedText(rows, merges, 8, 9, 10, "Cost Multiplier", 3);
        addMergedText(rows, merges, 8, 11, 12, costMultiplier, 4);

        addMergedText(rows, merges, 10, 1, 12, "UNIT PRICING", 2);
        addCell(rows, 11, 1, "QTY", 5);
        addMergedText(rows, merges, 11, 2, 8, "PART DESCRIPTION / NOTES", 5);
        addMergedText(rows, merges, 11, 9, 10, "NET EACH $", 5);
        addMergedText(rows, merges, 11, 11, 12, "EXTENDED $", 5);

        let total = 0;
        units.forEach((unit, index) => {
            const row = 12 + index;
            const linePrice = Number(unit.netPrice);
            total += linePrice;
            const selectedOptions = (unit.options ?? [])
                .filter(option => option.optionId)
                .map(option => {
                    const name = option.optionId === "hdg-internal-service-platform"
                        ? "HDG Internal Service Platform"
                        : option.optionId;
                    return `${name} (qty ${option.quantity})`;
                });
            const description = [
                `Evaporative Condenser - ${unit.model}`,
                unit.location ? `Location: ${unit.location}` : "",
                unit.tag ? `Unit Tag: ${unit.tag}` : "",
                `${Number(unit.requiredCapacity).toLocaleString()} MBH required capacity`,
                `${unit.refrigerant} refrigerant`,
                selectedOptions.length ? `Options: ${selectedOptions.join(", ")}` : ""
            ].filter(Boolean).join(" | ");
            addCell(rows, row, 1, 1, 4);
            addMergedText(rows, merges, row, 2, 8, description, 4);
            addMergedText(rows, merges, row, 9, 10, linePrice, 6);
            addMergedText(rows, merges, row, 11, 12, linePrice, 6);
        });

        const totalRow = 12 + units.length;
        addMergedText(rows, merges, totalRow, 1, 8, "TOTAL", 7);
        addMergedText(rows, merges, totalRow, 9, 10, "Total", 7);
        addMergedText(rows, merges, totalRow, 11, 12, total, 7);
        addMergedText(rows, merges, totalRow + 2, 1, 12, "Quoted price is good for 30 days; freight and taxes are not included.", 0);
        addMergedText(rows, merges, totalRow + 3, 1, 12, "Evaporative Condenser Product: All prices FOB Dixon, IL.", 0);
        addMergedText(rows, merges, totalRow + 4, 1, 12, "Unit specifications are listed on the Item EC tab.", 0);
        addMergedText(rows, merges, totalRow + 5, 1, 12, "Pricing uses current app values: $1.00 unit list-price and $0.00 option-price placeholders.", 0);
        return worksheetXml(rows, merges, [8, 12, 12, 12, 12, 12, 12, 12, 13, 13, 13, 13]);
    }

    function makeItemEcSheet(project, units, exportDate) {
        const rows = new Map();
        const merges = [];
        addMergedText(rows, merges, 1, 1, 8, "SPX Cooling Tech, LLC", 1);
        addMergedText(rows, merges, 2, 1, 8, "827 West Progress Drive, Dixon, IL 61021", 0);
        addMergedText(rows, merges, 3, 1, 8, "Phone (815) 284-2700   Fax (815) 288-0807", 0);
        addMergedText(rows, merges, 5, 1, 8, "EVAPORATIVE CONDENSER SPECIFICATION SHEET", 2);
        addPair(rows, merges, 7, "Customer", project.customer, "Project Name", project.projectName);
        addPair(rows, merges, 8, "Quote #", project.quoteNumber, "Prepared By", project.preparedBy);
        addPair(rows, merges, 9, "Export Date", exportDate, "Contact", project.contact);

        let row = 11;
        units.forEach((unit, index) => {
            addMergedText(
                rows,
                merges,
                row++,
                1,
                8,
                `ITEM EC - UNIT ${unit.unitNumber}${unit.location ? ` - ${unit.location}` : ""}${unit.tag ? ` - ${unit.tag}` : ""}`,
                2
            );
            addPair(rows, merges, row++, "Unit Location", unit.location, "Unit Tag", unit.tag);

            addMergedText(rows, merges, row++, 1, 8, "DESIGN CONDITIONS", 2);
            addPair(rows, merges, row++, "Total Heat Rejection Required", unit.requiredCapacity, "Condensing Temperature", unit.condensingTemperature, {
                leftValue: 4,
                rightValue: 4
            });
            addPair(rows, merges, row++, "Wet Bulb Temperature", unit.wetBulbTemperature, "Refrigerant", unit.refrigerant);

            addMergedText(rows, merges, row++, 1, 8, "ACTUAL CAPACITY", 2);
            addPair(rows, merges, row++, "Total Heat Rejection", unit.correctedHor, "Capacity Match", unit.capacityPercent, {
                rightValue: 9
            });
            addPair(rows, merges, row++, "Base HOR", unit.baseHor, "Fan Motor", unit.fanMotor);

            addMergedText(rows, merges, row++, 1, 8, "EVAPORATIVE CONDENSER DESCRIPTION", 2);
            addPair(rows, merges, row++, "Product", "IEC", "Model Number", unit.model);
            addPair(rows, merges, row++, "Motor Voltage", unit.motorVoltage, "Air Flow Rate", unit.airFlowCfm ?? "N/A");
            addPair(rows, merges, row++, "Internal Coil Volume", unit.internalCoilVolume ?? "N/A", "R717 Charge", unit.r717ChargeLb ?? "N/A");
            if (index < units.length - 1) row++;
        });
        return worksheetXml(rows, merges, [18, 12, 12, 12, 18, 12, 12, 12]);
    }

    function stylesXml() {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red](&quot;$&quot;#,##0.00)"/><numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/></numFmts>
<fonts count="3">
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><color rgb="FFFFFFFF"/><sz val="14"/><name val="Arial"/></font>
<font><b/><color rgb="FF004F9F"/><sz val="11"/><name val="Arial"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF004F9F"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCEEFF"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD6D6D6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FF8797A5"/></left><right style="thin"><color rgb="FF8797A5"/></right><top style="thin"><color rgb="FF8797A5"/></top><bottom style="thin"><color rgb="FF8797A5"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
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
