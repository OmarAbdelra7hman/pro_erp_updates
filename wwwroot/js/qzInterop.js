let _qzLoadPromise = null;
function ensureQzLoaded() {
    if (window.qz) return Promise.resolve(window.qz);
    if (_qzLoadPromise) return _qzLoadPromise;

    _qzLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js?v=4';
        script.onload = () => resolve(window.qz);
        script.onerror = () => reject(new Error('QZ Tray library failed to load'));
        document.head.appendChild(script);
    });
    return _qzLoadPromise;
}

function parseEscPosReceipt(content) {
    const lines = [];
    let text = '';
    let align = 'left';
    let bold = false;

    const flush = () => {
        lines.push({ text, align, bold });
        text = '';
    };

    for (let i = 0; i < (content || '').length; i++) {
        const code = content.charCodeAt(i);
        if (code === 0x1B && i + 1 < content.length) {
            const command = content[i + 1];
            if (command === '@') {
                align = 'left';
                bold = false;
                i += 1;
                continue;
            }
            if ((command === 'a' || command === 'E') && i + 2 < content.length) {
                const value = content.charCodeAt(i + 2);
                if (command === 'a') align = value === 1 ? 'center' : value === 2 ? 'right' : 'left';
                if (command === 'E') bold = value !== 0;
                i += 2;
                continue;
            }
        }
        if (code === 0x1D && content[i + 1] === 'V') {
            i += Math.min(3, content.length - i - 1);
            continue;
        }
        if (code === 0x0A) {
            flush();
            continue;
        }
        if (code === 0x0D || code < 0x20) continue;
        text += content[i];
    }
    if (text) flush();
    return lines;
}

async function receiptToPngBase64(content) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const defaults = [
        { id: 'header', visible: true, fontSize: 29, bold: true, align: 'center' },
        { id: 'document', visible: true, fontSize: 27, bold: false, align: 'right' },
        { id: 'items', visible: true, fontSize: 27, bold: false, align: 'right' },
        { id: 'totals', visible: true, fontSize: 29, bold: true, align: 'right' },
        { id: 'footer', visible: true, fontSize: 26, bold: false, align: 'center' }
    ];
    let template = { paperWidth: 80, blocks: defaults };
    try {
        const saved = JSON.parse(localStorage.getItem('proerp_receipt_designer') || 'null');
        if (saved && Array.isArray(saved.blocks)) template = saved;
    } catch (_) { }

    const width = Number(template.paperWidth) === 58 ? 384 : 576;
    const padding = 18;
    const lineHeight = 38;
    const maxTextWidth = width - (padding * 2);
    const parsedLines = parseEscPosReceipt(content);
    const sectionIds = ['header', 'document', 'items', 'totals', 'footer'];
    const sections = Object.fromEntries(sectionIds.map(id => [id, []]));
    let sectionIndex = 0;
    for (const line of parsedLines) {
        if (/^-{8,}$/.test(line.text.trim())) {
            sectionIndex = Math.min(sectionIndex + 1, sectionIds.length - 1);
            continue;
        }
        sections[sectionIds[sectionIndex]].push(line);
    }

    const configuredBlocks = template.blocks
        .filter(block => block && sectionIds.includes(block.id) && block.visible !== false);
    const sourceLines = [];
    configuredBlocks.forEach((block, blockIndex) => {
        const style = {
            fontSize: Math.max(18, Math.min(42, Number(block.fontSize) || 27)),
            bold: block.bold === true,
            align: ['left', 'center', 'right'].includes(block.align) ? block.align : 'right'
        };
        sections[block.id].forEach(line => sourceLines.push({ ...line, designerStyle: style }));
        if (blockIndex < configuredBlocks.length - 1)
            sourceLines.push({ text: '------------------------------------------', align: 'center', bold: false, designerStyle: { fontSize: 21, bold: false, align: 'center' } });
    });

    const measured = document.createElement('canvas').getContext('2d');
    const renderedLines = [];

    for (const line of sourceLines) {
        const style = line.designerStyle || { fontSize: 28, bold: line.bold, align: line.align };
        measured.font = `${(line.bold || style.bold) ? '900' : '700'} ${style.fontSize}px Arial, Tahoma, sans-serif`;
        if (!line.text || measured.measureText(line.text).width <= maxTextWidth) {
            renderedLines.push(line);
            continue;
        }

        const words = line.text.split(/\s+/);
        let current = '';
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (current && measured.measureText(candidate).width > maxTextWidth) {
                renderedLines.push({ ...line, text: current });
                current = word;
            } else {
                current = candidate;
            }
        }
        if (current) renderedLines.push({ ...line, text: current });
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    const receiptHeight = renderedLines.reduce((height, line) => {
        const fontSize = line.designerStyle?.fontSize || 28;
        return height + Math.max(lineHeight, fontSize + 10);
    }, padding * 2);
    canvas.height = Math.max(80, receiptHeight);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = false;

    let y = padding;
    renderedLines.forEach((line) => {
        const hasArabic = /[\u0600-\u06FF]/.test(line.text);
        const style = line.designerStyle || { fontSize: 28, bold: line.bold, align: line.align };
        const currentLineHeight = Math.max(lineHeight, style.fontSize + 10);
        const effectiveAlign = style.align || line.align;
        ctx.font = `${(line.bold || style.bold) ? '900' : '700'} ${style.fontSize}px Arial, Tahoma, sans-serif`;
        ctx.direction = hasArabic ? 'rtl' : 'ltr';

        if (effectiveAlign === 'center') {
            ctx.textAlign = 'center';
            ctx.fillText(line.text, width / 2, y + currentLineHeight / 2);
        } else if (effectiveAlign === 'right' || (hasArabic && effectiveAlign !== 'left')) {
            ctx.textAlign = 'right';
            ctx.fillText(line.text, width - padding, y + currentLineHeight / 2);
        } else {
            ctx.textAlign = 'left';
            ctx.fillText(line.text, padding, y + currentLineHeight / 2);
        }
        y += currentLineHeight;
    });

    return canvas.toDataURL('image/png').split(',')[1];
}

window.qzInterop = {
    connect: async function () {
        try {
            const qz = await ensureQzLoaded();
            qz.security.setCertificatePromise((resolve, reject) => {
                fetch('/api/qz/cert?v=1', {cache: 'no-store'})
                    .then(r => r.text())
                    .then(resolve)
                    .catch(reject);
            });

            qz.security.setSignatureAlgorithm("SHA512");
            qz.security.setSignaturePromise(function(toSign) {
                return function(resolve, reject) {
                    fetch('/api/qz/sign?request=' + encodeURIComponent(toSign))
                        .then(r => r.text())
                        .then(resolve)
                        .catch(reject);
                };
            });

            if (qz.websocket.isActive()) {
                return true;
            } else {
                return await qz.websocket.connect().then(() => true).catch((err) => {
                    console.error("QZ Connect Error:", err);
                    return false;
                });
            }
        } catch (err) {
            console.error("QZ Load Error:", err);
            return false;
        }
    },
    getPrinters: async function () {
        const qz = await ensureQzLoaded();
        return new Promise((resolve, reject) => {
            qz.printers.find().then((printers) => {
                resolve(printers);
            }).catch((err) => {
                console.error("QZ Get Printers Error:", err);
                resolve([]);
            });
        });
    },
    printPdf: async function (printerName, base64Pdf) {
        const qz = await ensureQzLoaded();
        return new Promise((resolve, reject) => {
             var config = qz.configs.create(printerName);
             var pdffile = [
                 { type: 'pixel', format: 'pdf', flavor: 'base64', data: base64Pdf }
             ];
             qz.print(config, pdffile).then(() => {
                 resolve(true);
             }).catch((err) => {
                 console.error("QZ Print Error:", err);
                 resolve(false);
             });
        });
    },
    printRaw: async function (printerName, content) {
        // ESC/POS is a byte protocol for a physical receipt printer. Sending
        // it to a virtual PDF/XPS printer creates an invalid, empty document.
        // Return false here so the calling page uses its existing FastReport
        // PDF path instead.
        if (/\b(microsoft\s+print\s+to\s+pdf|microsoft\s+xps\s+document\s+writer|adobe\s+pdf|foxit\s+pdf|pdfcreator|save\s+as\s+pdf)\b/i.test(printerName || '')) {
            console.info('Skipping raw ESC/POS output for virtual printer:', printerName);
            return false;
        }

        const qz = await ensureQzLoaded();
        try {
            // Most ESC/POS printers do not understand UTF-8 Arabic. Render the
            // receipt in the browser first so shaping and mixed RTL/LTR text are
            // correct, then let QZ send a monochrome raster to the printer.
            const imageBase64 = await receiptToPngBase64(content || '');
            const config = qz.configs.create(printerName, {
                jobName: 'ProERP Thermal Receipt'
            });
            const printData = [{
                type: 'raw',
                format: 'image',
                flavor: 'base64',
                data: imageBase64,
                options: {
                    language: 'ESCPOS',
                    dotDensity: 'double'
                }
            }, {
                type: 'raw',
                format: 'command',
                flavor: 'base64',
                data: 'HVZCAA==' // GS V B 0: full cut after the raster receipt
            }];
            await qz.print(config, printData);
            return true;
        } catch (err) {
            console.error('QZ ESC/POS raster print error:', err);
            return false;
        }
    },
    printImage: async function (printerName, base64Image) {
        if (/\b(microsoft\s+print\s+to\s+pdf|microsoft\s+xps\s+document\s+writer|adobe\s+pdf|foxit\s+pdf|pdfcreator|save\s+as\s+pdf)\b/i.test(printerName || '')) {
            return false;
        }

        const qz = await ensureQzLoaded();
        try {
            const config = qz.configs.create(printerName, { jobName: 'ProERP FastReport Receipt' });
            await qz.print(config, [{
                type: 'raw',
                format: 'image',
                flavor: 'base64',
                data: base64Image,
                options: { language: 'ESCPOS', dotDensity: 'double' }
            }, {
                type: 'raw',
                format: 'command',
                flavor: 'base64',
                data: 'HVZCAA=='
            }]);
            return true;
        } catch (err) {
            console.error('QZ FastReport raster print error:', err);
            return false;
        }
    },
    saveSetting: function (key, value) {
        localStorage.setItem(key, value);
    },
    readSetting: function (key) {
        return localStorage.getItem(key) || "";
    }
};

// Flat names for Blazor JS interop (avoid "qzInterop.connect" resolution issues)
window.proErpQzConnect = function () {
    if (!window.qzInterop || typeof window.qzInterop.connect !== 'function') return Promise.resolve(false);
    return window.qzInterop.connect();
};
window.proErpQzGetPrinters = function () {
    if (!window.qzInterop || typeof window.qzInterop.getPrinters !== 'function') return Promise.resolve([]);
    return window.qzInterop.getPrinters();
};
window.proErpQzPrintPdf = function (printerName, base64Pdf) {
    if (!window.qzInterop || typeof window.qzInterop.printPdf !== 'function') return Promise.resolve(false);
    return window.qzInterop.printPdf(printerName, base64Pdf);
};
window.proErpQzPrintRaw = function (printerName, content) {
    if (!window.qzInterop || typeof window.qzInterop.printRaw !== 'function') return Promise.resolve(false);
    return window.qzInterop.printRaw(printerName, content);
};
window.proErpQzPrintImage = function (printerName, base64Image) {
    if (!window.qzInterop || typeof window.qzInterop.printImage !== 'function') return Promise.resolve(false);
    return window.qzInterop.printImage(printerName, base64Image);
};
window.proErpQzSaveSetting = function (key, value) {
    if (window.qzInterop && typeof window.qzInterop.saveSetting === 'function')
        window.qzInterop.saveSetting(key, value);
};
window.proErpQzReadSetting = function (key) {
    if (!window.qzInterop || typeof window.qzInterop.readSetting !== 'function') return "";
    return window.qzInterop.readSetting(key);
};
