// ── Blazor interop: single global functions (avoid "a.b.c" identifiers — blazor.web.js findFunction can fail) ──
window.proErpApplyTheme = function (username) {
    try {
        if (window.themeHelper && typeof window.themeHelper.applyTheme === 'function')
            return window.themeHelper.applyTheme(username);
    } catch (e) { }
    return 'dark';
};
window.proErpSetTheme = function (username, theme) {
    try {
        if (window.themeHelper && typeof window.themeHelper.setTheme === 'function')
            window.themeHelper.setTheme(username, theme);
    } catch (e) { }
};
window.proErpStorageGet = function (key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
};
window.proErpStorageSet = function (key, value) {
    try { localStorage.setItem(key, value); } catch (e) { }
};
window.proErpStorageRemove = function (key) {
    try { localStorage.removeItem(key); } catch (e) { }
};
window.proErpWindowOpen = function (url, target) {
    try { window.open(url, target || '_blank'); } catch (e) { }
};
window.proErpWindowPrint = function () {
    try { window.print(); } catch (e) { }
};
window.proErpClipboardWriteText = function (text) {
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
            return navigator.clipboard.writeText(text);
    } catch (e) { }
    return Promise.resolve();
};
window.proErpEval = function (code) {
    try { return eval(code); } catch (e) { return null; }
};
window.proErpConsoleLog = function (message) {
    try { console.log(message); } catch (e) { }
};
window.proErpRenderDashboardChart = function (categories, salesData, purchasesData) {
    if (typeof window.renderDynamicDashboardChart === 'function')
        window.renderDynamicDashboardChart(categories, salesData, purchasesData);
};

// Focus an element by id, or the first focusable child inside it
window.proErpFocusById = function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    // Try the element itself first
    if (typeof el.focus === 'function' && el.tagName !== 'DIV' && el.tagName !== 'SPAN') {
        el.focus();
        return;
    }
    // For custom wrappers (like AccountSelector/Dropdown): focus first focusable inside
    var focusable = el.querySelector('input, [tabindex]:not([tabindex="-1"]), .rz-dropdown');
    if (focusable) focusable.focus();
};

// ── Voucher: Enter key navigation ──────────────────────────────────────────
// Uses capture=true so it fires BEFORE Radzen's internal keydown handlers
document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;

    // Enter on the amount field → jump to from-account
    var amountEl = document.getElementById('voucherAmount');
    if (amountEl && amountEl.contains(e.target)) {
        e.preventDefault();
        window.proErpFocusById('voucherFromAccount');
        return;
    }
}, true); // true = capture phase

window.proErpDownloadObject = function (fileName, byteBase64) {
    var link = document.createElement('a');
    link.download = fileName;
    link.href = "data:application/octet-stream;base64," + byteBase64;
    document.body.appendChild(link); // Needed for Firefox
    link.click();
    document.body.removeChild(link);
}

// Alias used by Excel import template download
window.downloadFileFromBase64 = function (fileName, byteBase64, mimeType) {
    var link = document.createElement('a');
    link.download = fileName;
    link.href = "data:" + (mimeType || "application/octet-stream") + ";base64," + byteBase64;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.downloadFileFromUrl = function (url) {
    window.location.href = url;
}

window.downloadFileFromStream = async (fileName, contentStreamReference) => {
    const arrayBuffer = await contentStreamReference.arrayBuffer();
    const blob = new Blob([arrayBuffer]);
    const url = URL.createObjectURL(blob);
    const anchorElement = document.createElement('a');
    anchorElement.href = url;
    anchorElement.download = fileName ?? '';
    anchorElement.click();
    anchorElement.remove();
    
    // Fix for Chrome race condition: wait a brief moment before revoking the URL
    // so Chrome has time to read the 'download' attribute correctly instead of using the Blob GUID.
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 100);
}

// ── F5 / Ctrl+R Soft Refresh Intercept ──────────────────────────────────────
// Prevents full browser reload; instead calls Blazor to remount only the active tab.
let _proErpDirty = false;

// Track any input/change in form fields
document.addEventListener('input', function (e) {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        _proErpDirty = true;
    }
}, { capture: true, passive: true });

window.clearTabDirty = function () { _proErpDirty = false; };

// Handle browser refresh BUTTON (not F5) via beforeunload native dialog
// window.addEventListener('beforeunload', function (e) {
//     if (_proErpDirty) {
//         e.preventDefault();
//         e.returnValue = ''; // Required for Chrome/Edge
//     }
// });

window.registerF5Intercept = function (dotNetRef) {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
            e.preventDefault();
            e.stopPropagation();
            if (_proErpDirty) {
                dotNetRef.invokeMethodAsync('ShowUnsavedAlert');
            } else {
                dotNetRef.invokeMethodAsync('SoftRefreshActiveTab');
            }
        }
    }, { capture: true });
};

// ── Numeric Input Enhancements ────────────────────────────────────────────────
(function () {
    // Raw value store so we can restore before editing
    var _rawValues = new WeakMap();

    // Select-all on focus + restore raw value
    document.addEventListener('focusin', function (e) {
        var spinner = e.target.closest && e.target.closest('.rz-numeric');
        if (!spinner) return;
        var raw = _rawValues.get(e.target);
        if (raw !== undefined) {
            e.target.value = raw;
        }
        setTimeout(function () { try { e.target.select(); } catch (_) {} }, 0);
    }, true);

    // Format with thousands separator on blur
    document.addEventListener('focusout', function (e) {
        var spinner = e.target.closest && e.target.closest('.rz-numeric');
        if (!spinner) return;
        var val = e.target.value;
        _rawValues.set(e.target, val);
        var num = parseFloat(val.replace(/,/g, ''));
        if (!isNaN(num) && val !== '') {
            var decimals = val.includes('.') ? (val.split('.')[1] || '').length : 0;
            e.target.value = num.toLocaleString('en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals > 0 ? decimals : 0,
                useGrouping: true
            });
        }
    }, true);
})();

// ── Arabic Numerals to English Numerals Interceptor ─────────────────────────
(function () {
    const arabicNumbers = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    const englishNumbers = ['0','1','2','3','4','5','6','7','8','9'];

    // Use capturing phase to intercept inputs early
    document.addEventListener('input', function (e) {
        if (!e.target || (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA')) return;
        
        let value = e.target.value;
        if (!value) return;

        let hasArabic = false;
        for (let i = 0; i < arabicNumbers.length; i++) {
            if (value.includes(arabicNumbers[i])) {
                value = value.split(arabicNumbers[i]).join(englishNumbers[i]);
                hasArabic = true;
            }
        }

        if (hasArabic) {
            // Check if we can get selection offsets (some input types like 'number' don't support selection ranges)
            let start = null, end = null;
            try {
                start = e.target.selectionStart;
                end = e.target.selectionEnd;
            } catch (ex) {}

            e.target.value = value;
            
            try {
                if (start !== null) {
                    e.target.setSelectionRange(start, end);
                }
            } catch (ex) {}

            // Fire an input event for Blazor's data binding
            e.target.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, true);
})();
