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
            // TextEncoder preserves Arabic/Unicode where the printer firmware
            // supports UTF-8, while the ESC/POS bytes remain unchanged.
            const bytes = new TextEncoder().encode(content || '');
            let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
            }

            const config = qz.configs.create(printerName, {
                encoding: 'UTF-8',
                jobName: 'ProERP Thermal Receipt'
            });
            const rawData = [{
                type: 'raw',
                format: 'command',
                flavor: 'base64',
                data: btoa(binary)
            }];
            await qz.print(config, rawData);
            return true;
        } catch (err) {
            console.error('QZ raw thermal print error:', err);
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
window.proErpQzSaveSetting = function (key, value) {
    if (window.qzInterop && typeof window.qzInterop.saveSetting === 'function')
        window.qzInterop.saveSetting(key, value);
};
window.proErpQzReadSetting = function (key) {
    if (!window.qzInterop || typeof window.qzInterop.readSetting !== 'function') return "";
    return window.qzInterop.readSetting(key);
};
