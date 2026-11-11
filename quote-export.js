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

    function parseXml(xml, errorMessage) {
        const document = new DOMParser().parseFromString(xml, "application/xml");
        if (document.getElementsByTagName("parsererror").length) {
            throw new Error(errorMessage);
        }
        return document;
    }

    function parseWorksheet(xml) {
        return parseXml(xml, "The quote template contains invalid worksheet XML.");
    }

    function serializeXml(document) {
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

    function getColumnNumber(reference) {
        return reference.match(/[A-Z]+/)[0].split("").reduce((number, character) =>
            number * 26 + character.charCodeAt(0) - 64, 0
        );
    }

    function ensureCell(sheetData, rowNumber, reference) {
        const row = getRow(sheetData, rowNumber);
        const existingCell = row && findCell(row, reference);
        if (existingCell) return existingCell;
        if (!row) throw new Error(`The quote template is missing row ${rowNumber}.`);

        const column = reference.match(/[A-Z]+/)[0];
        const styleRow = getRow(sheetData, column === "B" ? 12 : 13);
        const styleCell = styleRow && findCell(styleRow, `${column}${column === "B" ? 12 : 13}`);
        if (!styleCell) throw new Error(`The quote template is missing a formatted ${column} line-item cell.`);

        const cell = styleCell.cloneNode(true);
        cell.setAttribute("r", reference);
        const nextCell = Array.from(row.getElementsByTagNameNS(spreadsheetNamespace, "c"))
            .find(existing => getColumnNumber(existing.getAttribute("r")) > getColumnNumber(reference));
        row.insertBefore(cell, nextCell ?? null);
        return cell;
    }

    function setQuoteMerge(sheet, reference, rowNumber) {
        const mergeCells = sheet.getElementsByTagNameNS(spreadsheetNamespace, "mergeCells")[0];
        if (!mergeCells) throw new Error("The quote template is missing its merged-cell definitions.");

        for (const merge of Array.from(mergeCells.getElementsByTagNameNS(spreadsheetNamespace, "mergeCell"))) {
            const existing = merge.getAttribute("ref");
            if (/^[BCD]\d+:H\d+$/.test(existing) &&
                Number(existing.match(/\d+/)?.[0]) === rowNumber && existing !== reference) {
                mergeCells.removeChild(merge);
            }
        }
        if (!Array.from(mergeCells.getElementsByTagNameNS(spreadsheetNamespace, "mergeCell"))
            .some(merge => merge.getAttribute("ref") === reference)) {
            const merge = sheet.createElementNS(spreadsheetNamespace, "mergeCell");
            merge.setAttribute("ref", reference);
            mergeCells.appendChild(merge);
        }
        mergeCells.setAttribute("count", String(mergeCells.getElementsByTagNameNS(spreadsheetNamespace, "mergeCell").length));
    }

    function configureQuotePageHeaders(sheet) {
        const sheetData = getSheetData(sheet);
        for (const [cell, label] of [
            ["B10", "Line Item #"],
            ["C10", "Location"],
            ["D10", "Model #"]
        ]) {
            const row = getRow(sheetData, 10);
            const headerCell = row && findCell(row, cell);
            if (!headerCell) throw new Error(`The quote template is missing cell ${cell}.`);
            writeCell(headerCell, label);
        }
        setQuoteMerge(sheet, "D10:H10", 10);
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

    function applyRowStyle(sheetData, rowNumber, templateRowNumber) {
        const row = getRow(sheetData, rowNumber);
        const templateRow = getRow(sheetData, templateRowNumber);
        if (!row || !templateRow) throw new Error("The quote template is missing a formatted line-item row.");

        for (const cell of templateRow.getElementsByTagNameNS(spreadsheetNamespace, "c")) {
            const reference = cell.getAttribute("r");
            const column = reference.match(/^[A-Z]+/)[0];
            const target = ensureCell(sheetData, rowNumber, `${column}${rowNumber}`);
            if (cell.hasAttribute("s")) target.setAttribute("s", cell.getAttribute("s"));
            else target.removeAttribute("s");
        }
    }

    function findRelationship(document, relationshipId, namespace) {
        return Array.from(document.getElementsByTagNameNS(namespace, "Relationship"))
            .find(relationship => relationship.getAttribute("Id") === relationshipId);
    }

    function resolvePartPath(sourcePart, target) {
        const parts = sourcePart.split("/").slice(0, -1);
        for (const part of target.split("/")) {
            if (!part || part === ".") continue;
            if (part === "..") parts.pop();
            else parts.push(part);
        }
        return parts.join("/");
    }

    function makeRelativePartPath(sourcePart, targetPart) {
        const source = sourcePart.split("/").slice(0, -1);
        const target = targetPart.split("/");
        while (source.length && target.length && source[0] === target[0]) {
            source.shift();
            target.shift();
        }
        return [...source.map(() => ".."), ...target].join("/");
    }

    function getRelationshipsPath(partPath) {
        const separator = partPath.lastIndexOf("/");
        return `${partPath.slice(0, separator)}/_rels/${partPath.slice(separator + 1)}.rels`;
    }

    function cloneZipEntry(entry, name) {
        return { ...entry, name, compressed: entry.compressed.slice() };
    }

    function addContentTypeOverride(document, partName, contentType) {
        const contentTypesNamespace = "http://schemas.openxmlformats.org/package/2006/content-types";
        const overrides = Array.from(document.getElementsByTagNameNS(contentTypesNamespace, "Override"));
        if (overrides.some(override => override.getAttribute("PartName") === partName)) return;
        const override = document.createElementNS(contentTypesNamespace, "Override");
        override.setAttribute("PartName", partName);
        override.setAttribute("ContentType", contentType);
        document.documentElement.appendChild(override);
    }

    async function updateWorkbookProperties(files, sheetNames) {
        const appProperties = files.find(file => file.name === "docProps/app.xml");
        if (!appProperties) return;

        const properties = parseXml(
            await readZipEntryText(appProperties),
            "The quote template contains invalid application properties XML."
        );
        const propertiesNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";
        const vectorNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes";
        const titles = properties.getElementsByTagNameNS(propertiesNamespace, "TitlesOfParts")[0]
            ?.getElementsByTagNameNS(vectorNamespace, "vector")[0];
        if (titles) {
            while (titles.firstChild) titles.removeChild(titles.firstChild);
            titles.setAttribute("size", String(sheetNames.length));
            for (const name of sheetNames) {
                const title = properties.createElementNS(vectorNamespace, "vt:lpstr");
                title.textContent = name;
                titles.appendChild(title);
            }
        }

        const headingPairs = properties.getElementsByTagNameNS(propertiesNamespace, "HeadingPairs")[0]
            ?.getElementsByTagNameNS(vectorNamespace, "vector")[0];
        const worksheetCount = headingPairs?.getElementsByTagNameNS(vectorNamespace, "i4")[0];
        if (worksheetCount) worksheetCount.textContent = String(sheetNames.length);

        replaceZipEntryText(appProperties, serializeXml(properties));
    }

    function getNextPartNumber(files, directory, prefix, extension) {
        const expression = new RegExp(`^${directory}/${prefix}(\\d+)\\.${extension}$`);
        return files.reduce((max, file) => {
            const match = file.name.match(expression);
            return match ? Math.max(max, Number(match[1])) : max;
        }, 0) + 1;
    }

    async function cloneWorksheetRelationships(files, sourceSheetPath, targetSheetPath, contentTypes) {
        const sourceRelationshipsPath = getRelationshipsPath(sourceSheetPath);
        const sourceRelationships = files.find(file => file.name === sourceRelationshipsPath);
        if (!sourceRelationships) return;

        const relationshipNamespace = "http://schemas.openxmlformats.org/package/2006/relationships";
        const relationships = parseXml(
            await readZipEntryText(sourceRelationships),
            "The quote template contains invalid worksheet relationship XML."
        );
        const drawingRelationship = Array.from(relationships.getElementsByTagNameNS(relationshipNamespace, "Relationship"))
            .find(relationship => relationship.getAttribute("Type").endsWith("/drawing"));
        if (drawingRelationship) {
            const sourceDrawingPath = resolvePartPath(sourceSheetPath, drawingRelationship.getAttribute("Target"));
            const sourceDrawing = files.find(file => file.name === sourceDrawingPath);
            if (sourceDrawing) {
                const drawingNumber = getNextPartNumber(files, "xl/drawings", "drawing", "xml");
                const targetDrawingPath = `xl/drawings/drawing${drawingNumber}.xml`;
                files.push(cloneZipEntry(sourceDrawing, targetDrawingPath));
                drawingRelationship.setAttribute("Target", makeRelativePartPath(targetSheetPath, targetDrawingPath));

                const sourceDrawingRelationshipsPath = getRelationshipsPath(sourceDrawingPath);
                const sourceDrawingRelationships = files.find(file => file.name === sourceDrawingRelationshipsPath);
                if (sourceDrawingRelationships) {
                    files.push(cloneZipEntry(
                        sourceDrawingRelationships,
                        getRelationshipsPath(targetDrawingPath)
                    ));
                }

                const sourceDrawingType = Array.from(contentTypes.getElementsByTagNameNS(
                    "http://schemas.openxmlformats.org/package/2006/content-types", "Override"
                )).find(override => override.getAttribute("PartName") === `/${sourceDrawingPath}`);
                if (sourceDrawingType) {
                    addContentTypeOverride(contentTypes, `/${targetDrawingPath}`, sourceDrawingType.getAttribute("ContentType"));
                }
            }
        }

        const targetRelationships = cloneZipEntry(sourceRelationships, getRelationshipsPath(targetSheetPath));
        replaceZipEntryText(targetRelationships, serializeXml(relationships));
        files.push(targetRelationships);
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

        const dimension = sheet.getElementsByTagNameNS(spreadsheetNamespace, "dimension")[0];
        if (dimension) {
            dimension.setAttribute("ref", shiftReference(dimension.getAttribute("ref"), startRow, offset));
        }
    }

    function addQuoteLine(sheet, rowNumber, line) {
        const sheetData = getSheetData(sheet);
        let row = getRow(sheetData, rowNumber);
        if (!row) {
            const templateRowNumber = line.type === "unit"
                ? 12
                : line.type === "option"
                    ? (line.styleRow ?? 13)
                    : 16;
            const templateRow = getRow(sheetData, templateRowNumber);
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

        const templateRowNumber = line.type === "unit"
            ? 12
            : line.type === "option"
                ? (line.styleRow ?? 13)
                : 16;
        applyRowStyle(sheetData, rowNumber, templateRowNumber);
        for (const [column, value] of [["A", line.quantity], ["I", line.netEach], ["K", line.extended]]) {
            setCellValue(sheetData, rowNumber, `${column}${rowNumber}`, value);
        }
        for (const column of ["B", "C", "D"]) {
            const cell = findCell(row, `${column}${rowNumber}`);
            if (cell) writeCell(cell, "");
        }
        if (line.type === "unit") {
            for (const [column, value] of [
                ["B", line.unitNumber], ["C", line.location], ["D", line.model]
            ]) {
                writeCell(ensureCell(sheetData, rowNumber, `${column}${rowNumber}`), value);
            }
            setQuoteMerge(sheet, `D${rowNumber}:H${rowNumber}`, rowNumber);
        } else if (line.description) {
            writeCell(ensureCell(sheetData, rowNumber, `C${rowNumber}`), line.description);
            setQuoteMerge(sheet, `C${rowNumber}:H${rowNumber}`, rowNumber);
        } else {
            setQuoteMerge(sheet, `B${rowNumber}:H${rowNumber}`, rowNumber);
        }
    }

    function makeQuoteSheet(templateXml, project, units, exportDate) {
        const sheet = parseWorksheet(templateXml);
        configureQuotePageHeaders(sheet);
        const sheetData = getSheetData(sheet);
        const projectCells = [
            [6, "C6", project.customer], [6, "I6", project.contact],
            [7, "C7", project.projectName], [7, "I7", project.preparedBy],
            [8, "C8", project.quoteNumber], [8, "I8", exportDate]
        ];
        for (const [row, cell, value] of projectCells) setCellValue(sheetData, row, cell, value);

        const lines = [];
        for (const [index, unit] of units.entries()) {
            const basePrice = Number(unit.baseNetPrice) || 0;
            lines.push({
                type: "unit",
                quantity: 1,
                unitNumber: unit.unitNumber,
                location: unit.location,
                model: unit.model,
                netEach: basePrice,
                extended: basePrice
            });

            const options = (unit.options ?? []).filter(item => item.optionId);
            for (const [optionIndex, option] of options.entries()) {
                const name = option.optionId === "hdg-internal-service-platform"
                    ? "HDG Internal Service Platform"
                    : option.optionId;
                const quantity = Number(option.quantity) || 1;
                const netEach = Number(option.netEachPrice) || 0;
                lines.push({
                    type: "option",
                    styleRow: 13 + (optionIndex % 2),
                    quantity,
                    description: name,
                    netEach,
                    extended: quantity * netEach
                });
            }
            if (index < units.length - 1) {
                lines.push(
                    { type: "blank", quantity: "", netEach: "", extended: "" },
                    { type: "blank", quantity: "", netEach: "", extended: "" }
                );
            }
        }

        const totalRow = Math.max(61, 12 + lines.length);
        shiftRows(sheet, 61, totalRow - 61);
        for (let index = 0; index < Math.max(3, lines.length); index++) {
            const rowNumber = 12 + index;
            addQuoteLine(sheet, rowNumber, lines[index] ?? {
                type: "blank", quantity: "", netEach: "", extended: ""
            });
        }

        let total = 0;
        for (const line of lines) total += Number(line.extended) || 0;
        const finalSheetData = getSheetData(sheet);
        setCellValue(finalSheetData, totalRow, `K${totalRow}`, total);
        return serializeXml(sheet);
    }

    function populateItemPage(sheet, project, unit) {
        const sheetData = getSheetData(sheet);
        const set = (row, cell, value) => setCellValue(sheetData, row, `${cell}${row}`, value);
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

        const isDtc = unit.productLine === "DTC";
        const fanMotor = isDtc
            ? null
            : String(unit.fanMotor ?? "").match(/^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
        const fansPerCell = fanMotor ? Number(fanMotor[1]) : "N/A";
        const fanHp = fanMotor ? Number(fanMotor[2]) : "N/A";
        const descriptionValues = [
            [30, "C", isDtc ? "DTC" : "IEC"], [30, "I", fansPerCell],
            [31, "C", unit.model], [31, "I", fanHp],
            [32, "C", "N/A"], [32, "I", fanMotor ? fansPerCell * fanHp : "N/A"],
            [33, "C", "N/A"], [33, "I", isDtc ? Number(unit.fanMotor) : "N/A"],
            [34, "C", unit.motorVoltage], [34, "I", "N/A"],
            [35, "C", unit.r717ChargeLb ?? "N/A"], [35, "I", "N/A"],
            [36, "C", unit.airFlowCfm ?? "N/A"], [37, "C", "N/A"]
        ];
        if (isDtc) {
            descriptionValues.push(
                [40, "C", unit.shippingWeightLb], [40, "I", unit.shippingWeightLb],
                [41, "C", unit.heaviestSectionWeightLb],
                [42, "C", unit.operatingWeightLb], [42, "I", unit.operatingWeightLb],
                [43, "C", unit.widthFt], [43, "I", unit.widthFt],
                [44, "C", unit.lengthFt], [44, "I", unit.lengthFt],
                [45, "C", "N/A"]
            );
        }
        for (const [row, column, value] of descriptionValues) set(row, column, value);
    }

    function makeItemEcSheet(templateXml, project, unit) {
        const sheet = parseWorksheet(templateXml);
        populateItemPage(sheet, project, unit);
        return serializeXml(sheet);
    }

    async function makeItemSheets(files, project, units, itemSheet) {
        const workbook = files.find(file => file.name === "xl/workbook.xml");
        const workbookRelationships = files.find(file => file.name === "xl/_rels/workbook.xml.rels");
        const contentTypes = files.find(file => file.name === "[Content_Types].xml");
        if (!workbook || !workbookRelationships || !contentTypes) {
            throw new Error("The quote template is missing workbook sheet metadata.");
        }

        const workbookDocument = parseXml(
            await readZipEntryText(workbook),
            "The quote template contains invalid workbook XML."
        );
        const relationshipsDocument = parseXml(
            await readZipEntryText(workbookRelationships),
            "The quote template contains invalid workbook relationship XML."
        );
        const contentTypesDocument = parseXml(
            await readZipEntryText(contentTypes),
            "The quote template contains invalid content type XML."
        );
        const mainNamespace = spreadsheetNamespace;
        const officeRelationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        const packageRelationshipNamespace = "http://schemas.openxmlformats.org/package/2006/relationships";
        const contentTypeNamespace = "http://schemas.openxmlformats.org/package/2006/content-types";
        const sheets = workbookDocument.getElementsByTagNameNS(mainNamespace, "sheets")[0];
        if (!sheets) throw new Error("The quote template is missing its worksheet list.");

        const existingSheets = Array.from(sheets.getElementsByTagNameNS(mainNamespace, "sheet"));
        const itemSheetNode = existingSheets.find(sheet => sheet.getAttribute("name") === "Item EC");
        if (!itemSheetNode) throw new Error("The quote template is missing the Item EC worksheet.");
        const originalRelationshipId = itemSheetNode.getAttributeNS(officeRelationshipNamespace, "id");
        const originalRelationship = findRelationship(
            relationshipsDocument,
            originalRelationshipId,
            packageRelationshipNamespace
        );
        if (!originalRelationship || !originalRelationship.getAttribute("Type").endsWith("/worksheet")) {
            throw new Error("The quote template Item EC worksheet relationship is invalid.");
        }
        const originalSheetPath = resolvePartPath("xl/workbook.xml", originalRelationship.getAttribute("Target"));
        const originalSheetEntry = files.find(file => file.name === originalSheetPath);
        if (!originalSheetEntry || originalSheetEntry !== itemSheet) {
            throw new Error("The quote template Item EC worksheet file could not be found.");
        }
        const worksheetContentType = Array.from(contentTypesDocument.getElementsByTagNameNS(
            contentTypeNamespace, "Override"
        )).find(override => override.getAttribute("PartName") === `/${originalSheetPath}`);
        if (!worksheetContentType) throw new Error("The quote template Item EC content type is missing.");

        let nextSheetNumber = getNextPartNumber(files, "xl/worksheets", "sheet", "xml");
        let nextSheetId = existingSheets.reduce((max, sheet) =>
            Math.max(max, Number(sheet.getAttribute("sheetId")) || 0), 0
        ) + 1;
        let nextRelationshipNumber = Array.from(relationshipsDocument.getElementsByTagNameNS(
            packageRelationshipNamespace, "Relationship"
        )).reduce((max, relationship) => {
            const match = relationship.getAttribute("Id").match(/^rId(\d+)$/);
            return match ? Math.max(max, Number(match[1])) : max;
        }, 0) + 1;
        const templateXml = await readZipEntryText(originalSheetEntry);

        for (const [index, unit] of units.entries()) {
            const sheetName = `Item #${unit.unitNumber}`;
            let sheetNode;
            let sheetPath;
            let sheetEntry;
            if (index === 0) {
                sheetNode = itemSheetNode;
                sheetPath = originalSheetPath;
                sheetEntry = originalSheetEntry;
            } else {
                sheetPath = `xl/worksheets/sheet${nextSheetNumber++}.xml`;
                const relationshipId = `rId${nextRelationshipNumber++}`;
                sheetNode = itemSheetNode.cloneNode(true);
                sheetNode.setAttribute("sheetId", String(nextSheetId++));
                sheetNode.setAttributeNS(officeRelationshipNamespace, "r:id", relationshipId);
                const relationship = workbookDocument.createElementNS(packageRelationshipNamespace, "Relationship");
                relationship.setAttribute("Id", relationshipId);
                relationship.setAttribute("Type", originalRelationship.getAttribute("Type"));
                relationship.setAttribute("Target", makeRelativePartPath("xl/workbook.xml", sheetPath));
                relationshipsDocument.documentElement.appendChild(relationship);
                sheets.appendChild(sheetNode);

                sheetEntry = cloneZipEntry(originalSheetEntry, sheetPath);
                files.push(sheetEntry);
                await cloneWorksheetRelationships(files, originalSheetPath, sheetPath, contentTypesDocument);
                addContentTypeOverride(
                    contentTypesDocument,
                    `/${sheetPath}`,
                    worksheetContentType.getAttribute("ContentType")
                );
            }
            sheetNode.setAttribute("name", sheetName);
            replaceZipEntryText(sheetEntry, makeItemEcSheet(templateXml, project, unit));
        }

        await updateWorkbookProperties(
            files,
            Array.from(sheets.getElementsByTagNameNS(mainNamespace, "sheet"))
                .map(sheet => sheet.getAttribute("name"))
        );
        replaceZipEntryText(workbook, serializeXml(workbookDocument));
        replaceZipEntryText(workbookRelationships, serializeXml(relationshipsDocument));
        replaceZipEntryText(contentTypes, serializeXml(contentTypesDocument));
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

    function replaceZipEntryText(entry, content) {
        const bytes = encoder.encode(content);
        entry.method = 0;
        entry.flags = 0;
        entry.crc = crc32(bytes);
        entry.compressed = bytes;
        entry.uncompressedSize = bytes.length;
    }

    async function removeCalcChain(files) {
        const chainIndex = files.findIndex(file => file.name === "xl/calcChain.xml");
        if (chainIndex < 0) return;

        const relationships = files.find(file => file.name === "xl/_rels/workbook.xml.rels");
        const contentTypes = files.find(file => file.name === "[Content_Types].xml");
        if (!relationships || !contentTypes) {
            throw new Error("The quote template calculation chain references are missing.");
        }

        const relationshipNamespace = "http://schemas.openxmlformats.org/package/2006/relationships";
        const relationshipDocument = parseXml(
            await readZipEntryText(relationships),
            "The quote template contains invalid workbook relationship XML."
        );
        for (const relationship of Array.from(relationshipDocument.getElementsByTagNameNS(relationshipNamespace, "Relationship"))) {
            if (relationship.getAttribute("Type").endsWith("/calcChain")) {
                relationship.parentNode.removeChild(relationship);
            }
        }

        const contentTypeNamespace = "http://schemas.openxmlformats.org/package/2006/content-types";
        const contentTypeDocument = parseXml(
            await readZipEntryText(contentTypes),
            "The quote template contains invalid content type XML."
        );
        for (const override of Array.from(contentTypeDocument.getElementsByTagNameNS(contentTypeNamespace, "Override"))) {
            if (override.getAttribute("PartName") === "/xl/calcChain.xml") {
                override.parentNode.removeChild(override);
            }
        }

        files.splice(chainIndex, 1);
        replaceZipEntryText(relationships, serializeXml(relationshipDocument));
        replaceZipEntryText(contentTypes, serializeXml(contentTypeDocument));
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
        const templateUrl = new URL("quote-template.xlsx", document.baseURI);
        templateUrl.searchParams.set("v", "20261111-1507");
        const templateResponse = await fetch(templateUrl, { cache: "no-store" });
        if (!templateResponse.ok) {
            throw new Error(`The quote template could not be loaded (HTTP ${templateResponse.status}).`);
        }
        const files = readZipEntries(await templateResponse.arrayBuffer());
        await removeCalcChain(files);
        const quoteSheet = files.find(file => file.name === "xl/worksheets/sheet1.xml");
        const itemSheet = files.find(file => file.name === "xl/worksheets/sheet2.xml");
        if (!quoteSheet || !itemSheet) {
            throw new Error("The quote template is missing a required worksheet.");
        }
        replaceZipEntryText(
            quoteSheet,
            makeQuoteSheet(await readZipEntryText(quoteSheet), project, units, exportDate)
        );
        await makeItemSheets(files, project, units, itemSheet);
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
