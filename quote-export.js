(function () {
    const encoder = new TextEncoder();
    const crcTable = Array.from({ length: 256 }, (_, value) => {
        let crc = value;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
        return crc >>> 0;
    });

    const spreadsheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

    function parseWorksheet(xml) {
        const document = new DOMParser().parseFromString(xml, "application/xml");
        if (document.getElementsByTagName("parsererror").length) {
            throw new Error("The quote template contains invalid worksheet XML.");
        }
        return document;
    }

    function serializeWorksheet(document) {
        return new XMLSerializer().serializeToString(document);
    }

    function getSheetData(sheet) {
        const sheetData = sheet.getElementsByTagNameNS(spreadsheetNamespace, "sheetData")[0];
        if (!sheetData) throw new Error("The quote template worksheet is missing its data section.");
        return sheetData;
    }

    function getRow(sheetData, rowNumber) {
        return Array.from(sheetData.getElementsByTagNameNS(spreadsheetNamespace, "row"))
            .find(row => Number(row.getAttribute("r")) === rowNumber);
    }

    function insertRow(sheetData, row) {
        const rowNumber = Number(row.getAttribute("r"));
        const nextRow = Array.from(sheetData.getElementsByTagNameNS(spreadsheetNamespace, "row"))
            .find(existing => Number(existing.getAttribute("r")) > rowNumber);
        sheetData.insertBefore(row, nextRow ?? null);
    }

    function findCell(row, reference) {
        return Array.from(row.getElementsByTagNameNS(spreadsheetNamespace, "c"))
            .find(cell => cell.getAttribute("r") === reference);
    }

    function writeCell(cell, value) {
        while (cell.firstChild) cell.removeChild(cell.firstChild);
        if (typeof value === "number" && Number.isFinite(value)) {
            cell.removeAttribute("t");
            const numericValue = cell.ownerDocument.createElementNS(spreadsheetNamespace, "v");
            numericValue.textContent = String(value);
            cell.appendChild(numericValue);
            return;
        }

        cell.setAttribute("t", "inlineStr");
        const inlineString = cell.ownerDocument.createElementNS(spreadsheetNamespace, "is");
        const text = cell.ownerDocument.createElementNS(spreadsheetNamespace, "t");
        text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
        text.textContent = String(value ?? "");
        inlineString.appendChild(text);
        cell.appendChild(inlineString);
    }

    function setCellValue(sheetData, rowNumber, reference, value) {
        const row = getRow(sheetData, rowNumber);
        const cell = row && findCell(row, reference);
        if (!cell) throw new Error(`The quote template is missing cell ${reference}.`);
        writeCell(cell, value);
    }

    function shiftReference(reference, startRow, offset) {
        return reference.replace(/(\$?[A-Z]+\$?)(\d+)/g, (match, column, row) =>
            Number(row) >= startRow ? `${column}${Number(row) + offset}` : match
        );
    }

    function shiftRows(sheet, startRow, offset) {
        if (!offset) return;
        const sheetData = getSheetData(sheet);
        for (const row of sheetData.getElementsByTagNameNS(spreadsheetNamespace, "row")) {
            const rowNumber = Number(row.getAttribute("r"));
            if (rowNumber < startRow) continue;
            row.setAttribute("r", String(rowNumber + offset));
            for (const cell of row.getElementsByTagNameNS(spreadsheetNamespace, "c")) {
                cell.setAttribute("r", shiftReference(cell.getAttribute("r"), startRow, offset));
            }
        }

        const merges = sheet.getElementsByTagNameNS(spreadsheetNamespace, "mergeCell");
        for (const merge of merges) {
            const reference = merge.getAttribute("ref");
            const firstRow = Number(reference.match(/\d+/)?.[0]);
            if (firstRow >= startRow) {
                merge.setAttribute("ref", shiftReference(reference, startRow, offset));
            }
        }
    }

    function addQuoteLine(sheet, rowNumber, line) {
        const sheetData = getSheetData(sheet);
        let row = getRow(sheetData, rowNumber);
        if (!row) {
            const templateRow = getRow(sheetData, 15);
            if (!templateRow) throw new Error("The quote template is missing its formatted line-item row.");
            row = templateRow.cloneNode(true);
            const oldRowNumber = Number(row.getAttribute("r"));
            const rowOffset = rowNumber - oldRowNumber;
            row.setAttribute("r", String(rowNumber));
            for (const cell of row.getElementsByTagNameNS(spreadsheetNamespace, "c")) {
                cell.setAttribute("r", shiftReference(cell.getAttribute("r"), oldRowNumber, rowOffset));
            }
            insertRow(sheetData, row);

            const mergeCells = sheet.getElementsByTagNameNS(spreadsheetNamespace, "mergeCells")[0];
            for (const original of Array.from(mergeCells.getElementsByTagNameNS(spreadsheetNamespace, "mergeCell"))) {
                const reference = original.getAttribute("ref");
                if (Number(reference.match(/\d+/)?.[0]) !== oldRowNumber) continue;
                const merge = original.cloneNode(true);
                merge.setAttribute("ref", shiftReference(reference, oldRowNumber, rowOffset));
                mergeCells.appendChild(merge);
            }
            mergeCells.setAttribute("count", String(mergeCells.getElementsByTagNameNS(spreadsheetNamespace, "mergeCell").length));
        }

        for (const [column, value] of [
            ["A", line.quantity], ["B", line.description],
            ["I", line.netEach], ["K", line.extended]
        ]) {
            setCellValue(sheetData, rowNumber, `${column}${rowNumber}`, value);
        }
    }

    function makeQuoteSheet(templateXml, project, units, exportDate) {
        const sheet = parseWorksheet(templateXml);
        const sheetData = getSheetData(sheet);
        const projectCells = [
            [7, "C7", project.customer], [7, "I7", project.contact],
            [8, "C8", project.projectName], [8, "I8", project.preparedBy],
            [9, "C9", project.quoteNumber], [9, "I9", exportDate]
        ];
        for (const [row, cell, value] of projectCells) setCellValue(sheetData, row, cell, value);

        const lines = [];
        for (const unit of units) {
            const basePrice = Number(unit.baseNetPrice) || 0;
            const description = [
                `Evaporative Condenser - ${unit.model}`,
                unit.location ? `Location: ${unit.location}` : "",
                unit.tag ? `Unit Tag: ${unit.tag}` : "",
                `${Number(unit.requiredCapacity).toLocaleString()} MBH - ${unit.refrigerant}`
            ].filter(Boolean).join(" | ");
            lines.push({ quantity: 1, description, netEach: basePrice, extended: basePrice });

            for (const option of (unit.options ?? []).filter(item => item.optionId)) {
                const name = option.optionId === "hdg-internal-service-platform"
                    ? "HDG Internal Service Platform"
                    : option.optionId;
                const quantity = Number(option.quantity) || 1;
                const netEach = Number(option.netEachPrice) || 0;
                lines.push({ quantity, description: name, netEach, extended: quantity * netEach });
            }
        }

        const totalRow = Math.max(63, 14 + lines.length);
        shiftRows(sheet, 63, totalRow - 63);
        for (let index = 0; index < Math.max(3, lines.length); index++) {
            const rowNumber = 13 + index;
            addQuoteLine(sheet, rowNumber, lines[index] ?? {
                quantity: "", description: "", netEach: "", extended: ""
            });
        }

        let total = 0;
        for (const line of lines) total += line.extended;
        const finalSheetData = getSheetData(sheet);
        setCellValue(finalSheetData, totalRow, `K${totalRow}`, total);
        return serializeWorksheet(sheet);
    }

    function cloneItemPage(sheet, offset) {
        const sheetData = getSheetData(sheet);
        const pageRows = Array.from(sheetData.getElementsByTagNameNS(spreadsheetNamespace, "row"))
            .filter(row => Number(row.getAttribute("r")) <= 45)
            .map(row => row.cloneNode(true));
        for (const row of pageRows) {
            const oldRowNumber = Number(row.getAttribute("r"));
            row.setAttribute("r", String(oldRowNumber + offset));
            for (const cell of row.getElementsByTagNameNS(spreadsheetNamespace, "c")) {
                cell.setAttribute("r", shiftReference(cell.getAttribute("r"), 1, offset));
            }
            insertRow(sheetData, row);
        }

        const mergeCells = sheet.getElementsByTagNameNS(spreadsheetNamespace, "mergeCells")[0];
        for (const original of Array.from(mergeCells.getElementsByTagNameNS(spreadsheetNamespace, "mergeCell"))) {
            const reference = original.getAttribute("ref");
            if (Number(reference.match(/\d+/)?.[0]) > 45) continue;
            const merge = original.cloneNode(true);
            merge.setAttribute("ref", shiftReference(reference, 1, offset));
            mergeCells.appendChild(merge);
        }
        mergeCells.setAttribute("count", String(mergeCells.getElementsByTagNameNS(spreadsheetNamespace, "mergeCell").length));

        let rowBreaks = sheet.getElementsByTagNameNS(spreadsheetNamespace, "rowBreaks")[0];
        if (!rowBreaks) {
            rowBreaks = sheet.createElementNS(spreadsheetNamespace, "rowBreaks");
            const pageSetup = sheet.getElementsByTagNameNS(spreadsheetNamespace, "pageSetup")[0];
            const worksheet = sheet.documentElement;
            if (pageSetup?.nextSibling) worksheet.insertBefore(rowBreaks, pageSetup.nextSibling);
            else worksheet.appendChild(rowBreaks);
        }
        const breakNode = sheet.createElementNS(spreadsheetNamespace, "brk");
        breakNode.setAttribute("id", String(offset - 1));
        breakNode.setAttribute("max", "16383");
        breakNode.setAttribute("man", "1");
        rowBreaks.appendChild(breakNode);
        rowBreaks.setAttribute("count", String(rowBreaks.getElementsByTagNameNS(spreadsheetNamespace, "brk").length));
        rowBreaks.setAttribute("manualBreakCount", rowBreaks.getAttribute("count"));
    }

    function populateItemPage(sheet, project, unit, offset) {
        const sheetData = getSheetData(sheet);
        const set = (row, cell, value) => setCellValue(sheetData, row + offset, `${cell}${row + offset}`, value);
        set(8, "C", project.customer);
        set(9, "C", project.projectName);
        set(10, "C", project.quoteNumber);
        set(11, "C", unit.location);
        set(12, "C", unit.tag);
        set(16, "D", unit.requiredCapacity);
        set(17, "D", unit.condensingTemperature);
        set(18, "D", unit.wetBulbTemperature);
        set(19, "D", unit.refrigerant);
        set(23, "D", unit.correctedHor);
        set(24, "D", "N/A");
        set(25, "D", "N/A");

        const fanMotor = String(unit.fanMotor ?? "").match(/^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
        const fansPerCell = fanMotor ? Number(fanMotor[1]) : "N/A";
        const fanHp = fanMotor ? Number(fanMotor[2]) : "N/A";
        const descriptionValues = [
            [30, "C", "IEC"], [30, "I", fansPerCell],
            [31, "C", unit.model], [31, "I", fanHp],
            [32, "C", "N/A"], [32, "I", fanMotor ? fansPerCell * fanHp : "N/A"],
            [33, "C", "N/A"], [33, "I", "N/A"],
            [34, "C", unit.motorVoltage], [34, "I", "N/A"],
            [35, "C", unit.r717ChargeLb ?? "N/A"], [35, "I", "N/A"],
            [36, "C", unit.airFlowCfm ?? "N/A"], [37, "C", "N/A"]
        ];
        for (const [row, column, value] of descriptionValues) set(row, column, value);
    }

    function makeItemEcSheet(templateXml, project, units) {
        const sheet = parseWorksheet(templateXml);
        units.forEach((unit, index) => {
            const offset = index * 48;
            if (offset) cloneItemPage(sheet, offset);
            populateItemPage(sheet, project, unit, offset);
        });
        return serializeWorksheet(sheet);
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

    function readZipEntries(buffer) {
        const bytes = new Uint8Array(buffer);
        const view = new DataView(buffer);
        const minimumEocdOffset = Math.max(0, bytes.length - 65557);
        let eocdOffset = -1;
        for (let offset = bytes.length - 22; offset >= minimumEocdOffset; offset--) {
            if (view.getUint32(offset, true) === 0x06054b50) {
                eocdOffset = offset;
                break;
            }
        }
        if (eocdOffset < 0) throw new Error("The quote template is not a valid Excel workbook.");
        if (view.getUint16(eocdOffset + 4, true) !== 0 ||
            view.getUint16(eocdOffset + 6, true) !== 0) {
            throw new Error("Multi-disk Excel workbooks are not supported.");
        }

        const entryCount = view.getUint16(eocdOffset + 10, true);
        let offset = view.getUint32(eocdOffset + 16, true);
        const decoder = new TextDecoder();
        const entries = [];
        for (let index = 0; index < entryCount; index++) {
            if (view.getUint32(offset, true) !== 0x02014b50) {
                throw new Error("The quote template contains an invalid file entry.");
            }
            const flags = view.getUint16(offset + 8, true);
            const method = view.getUint16(offset + 10, true);
            const crc = view.getUint32(offset + 16, true);
            const compressedSize = view.getUint32(offset + 20, true);
            const uncompressedSize = view.getUint32(offset + 24, true);
            const filenameLength = view.getUint16(offset + 28, true);
            const extraLength = view.getUint16(offset + 30, true);
            const commentLength = view.getUint16(offset + 32, true);
            const localOffset = view.getUint32(offset + 42, true);
            const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + filenameLength));
            if (flags & 1) throw new Error("Encrypted quote templates are not supported.");

            const localFilenameLength = view.getUint16(localOffset + 26, true);
            const localExtraLength = view.getUint16(localOffset + 28, true);
            const dataOffset = localOffset + 30 + localFilenameLength + localExtraLength;
            entries.push({
                name,
                method,
                flags,
                modTime: view.getUint16(offset + 12, true),
                modDate: view.getUint16(offset + 14, true),
                crc,
                compressed: bytes.slice(dataOffset, dataOffset + compressedSize),
                uncompressedSize,
                externalAttributes: view.getUint32(offset + 38, true)
            });
            offset += 46 + filenameLength + extraLength + commentLength;
        }
        return entries;
    }

    async function readZipEntryText(entry) {
        let bytes = entry.compressed;
        if (entry.method === 8) {
            if (typeof DecompressionStream !== "function") {
                throw new Error("This browser cannot read the compressed quote template.");
            }
            const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
            bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        } else if (entry.method !== 0) {
            throw new Error(`The quote template uses unsupported compression method ${entry.method}.`);
        }
        if (bytes.length !== entry.uncompressedSize || crc32(bytes) !== entry.crc) {
            throw new Error(`The quote template entry ${entry.name} is incomplete or corrupted.`);
        }
        return new TextDecoder().decode(bytes);
    }

    function zipFiles(files) {
        const localParts = [];
        const centralParts = [];
        let localOffset = 0;
        for (const file of files) {
            const filename = encoder.encode(file.name);
            const compressed = file.compressed;
            const flags = 0x0800;
            const localHeader = new Uint8Array(30 + filename.length);
            const localView = new DataView(localHeader.buffer);
            write32(localView, 0, 0x04034b50);
            write16(localView, 4, 20);
            write16(localView, 6, flags);
            write16(localView, 8, file.method);
            write16(localView, 10, file.modTime);
            write16(localView, 12, file.modDate);
            write32(localView, 14, file.crc);
            write32(localView, 18, compressed.length);
            write32(localView, 22, file.uncompressedSize);
            write16(localView, 26, filename.length);
            write16(localView, 28, 0);
            localHeader.set(filename, 30);
            localParts.push(localHeader, compressed);

            const centralHeader = new Uint8Array(46 + filename.length);
            const centralView = new DataView(centralHeader.buffer);
            write32(centralView, 0, 0x02014b50);
            write16(centralView, 4, 20);
            write16(centralView, 6, 20);
            write16(centralView, 8, flags);
            write16(centralView, 10, file.method);
            write16(centralView, 12, file.modTime);
            write16(centralView, 14, file.modDate);
            write32(centralView, 16, file.crc);
            write32(centralView, 20, compressed.length);
            write32(centralView, 24, file.uncompressedSize);
            write16(centralView, 28, filename.length);
            write16(centralView, 30, 0);
            write16(centralView, 32, 0);
            write16(centralView, 34, 0);
            write16(centralView, 36, 0);
            write32(centralView, 38, file.externalAttributes);
            write32(centralView, 42, localOffset);
            centralHeader.set(filename, 46);
            centralParts.push(centralHeader);
            localOffset += localHeader.length + compressed.length;
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

    async function exportQuoteWorkbook({ project, units }) {
        if (!Array.isArray(units) || units.length === 0) {
            throw new Error("Add at least one unit before exporting the quote.");
        }

        const exportDate = new Date().toISOString().slice(0, 10);
        const templateResponse = await fetch(new URL("quote-template.xlsx", document.baseURI));
        if (!templateResponse.ok) {
            throw new Error(`The quote template could not be loaded (HTTP ${templateResponse.status}).`);
        }
        const files = readZipEntries(await templateResponse.arrayBuffer());
        const quoteSheet = files.find(file => file.name === "xl/worksheets/sheet1.xml");
        const itemSheet = files.find(file => file.name === "xl/worksheets/sheet2.xml");
        if (!quoteSheet || !itemSheet) {
            throw new Error("The quote template is missing a required worksheet.");
        }
        for (const [file, content] of [
            [quoteSheet, makeQuoteSheet(await readZipEntryText(quoteSheet), project, units, exportDate)],
            [itemSheet, makeItemEcSheet(await readZipEntryText(itemSheet), project, units)]
        ]) {
            const bytes = encoder.encode(content);
            file.method = 0;
            file.flags = 0;
            file.crc = crc32(bytes);
            file.compressed = bytes;
            file.uncompressedSize = bytes.length;
        }
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
