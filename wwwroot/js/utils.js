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
    if (typeof window.renderDynamicDashboardChart === 'function') {
        return window.renderDynamicDashboardChart(categories, salesData, purchasesData);
    } else {
        return new Promise(function(resolve) {
            setTimeout(function() {
                Promise.resolve(window.proErpRenderDashboardChart(categories, salesData, purchasesData)).then(resolve);
            }, 200);
        });
    }
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

// ── Sidebar Interactions (JS Driven) ──────────────────────────────────────────
document.addEventListener('click', function(e) {
    let toggleBtn = e.target.closest('.js-dropdown-toggle');
    if (toggleBtn) {
        let container = toggleBtn.closest('.js-dropdown-container');
        if (!container) return;
        
        let wasOpen = container.classList.contains('open');
        
        // Close siblings
        let siblings = container.parentElement.children;
        for (let i = 0; i < siblings.length; i++) {
            if (siblings[i].classList && siblings[i] !== container) {
                siblings[i].classList.remove('open');
                let content = siblings[i].querySelector('.js-dropdown-content');
                if (content) content.classList.remove('open');
                let arrow = siblings[i].querySelector('.js-dropdown-arrow');
                if (arrow) arrow.classList.remove('open');
                let tBtn = siblings[i].querySelector('.js-dropdown-toggle');
                if (tBtn) tBtn.classList.remove('active');
            }
        }
        
        if (!wasOpen) {
            container.classList.add('open');
            toggleBtn.classList.add('active');
            let content = container.querySelector('.js-dropdown-content');
            if (content) content.classList.add('open');
            let arrow = container.querySelector('.js-dropdown-arrow');
            if (arrow) arrow.classList.add('open');
        } else {
            container.classList.remove('open');
            toggleBtn.classList.remove('active');
            let content = container.querySelector('.js-dropdown-content');
            if (content) content.classList.remove('open');
            let arrow = container.querySelector('.js-dropdown-arrow');
            if (arrow) arrow.classList.remove('open');
        }
    }
});

// ── Server Signal Ping ────────────────────────────────────────────────────────
setInterval(async () => {
    const signalIcon = document.getElementById('server-signal-icon');
    if (!signalIcon) return;
    
    try {
        let start = performance.now();
        let res = await fetch('/icon-192.png', { method: 'HEAD', cache: 'no-store' });
        let latency = performance.now() - start;
        
        if (!res.ok) throw new Error('Offline');
        
        if (latency < 150) {
            signalIcon.setAttribute('icon', 'material-symbols:signal-cellular-4-bar-rounded');
            signalIcon.style.color = '#10b981'; // Green
        } else if (latency < 350) {
            signalIcon.setAttribute('icon', 'material-symbols:signal-cellular-3-bar-rounded');
            signalIcon.style.color = '#f59e0b'; // Yellow/Orange
        } else if (latency < 800) {
            signalIcon.setAttribute('icon', 'material-symbols:signal-cellular-2-bar-rounded');
            signalIcon.style.color = '#f97316'; // Orange
        } else {
            signalIcon.setAttribute('icon', 'material-symbols:signal-cellular-1-bar-rounded');
            signalIcon.style.color = '#ef4444'; // Red
        }
    } catch (e) {
        signalIcon.setAttribute('icon', 'material-symbols:signal-cellular-connected-no-internet-0-bar-rounded');
        signalIcon.style.color = '#ef4444';
    }
}, 5000);

// ── Mobile Menu Toggle ──────────────────────────────────────────
function setMobileMenuState(isOpen) {
    const overlay = document.querySelector('.js-mobile-overlay');
    const drawer = document.querySelector('.js-mobile-drawer');
    const toggle = document.querySelector('.js-mobile-menu-toggle');
    const icon = document.querySelector('.js-mobile-menu-icon');

    if (drawer) {
        drawer.classList.toggle('open', isOpen);
        drawer.setAttribute('aria-hidden', String(!isOpen));
    }
    if (overlay) {
        overlay.classList.toggle('open', isOpen);
        overlay.setAttribute('aria-hidden', String(!isOpen));
    }
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-label', isOpen ? 'إغلاق القائمة' : 'فتح القائمة');
    }
    if (icon) {
        icon.setAttribute('icon', isOpen ? 'material-symbols:close-rounded' : 'material-symbols:menu-rounded');
    }

    document.documentElement.classList.toggle('mobile-menu-open', isOpen);
}

document.addEventListener('click', function(e) {
    const toggleBtn = e.target.closest('.js-mobile-menu-toggle');
    const closeBtn = e.target.closest('.js-mobile-menu-close');
    const overlay = e.target.closest('.js-mobile-overlay');

    if (toggleBtn) {
        const drawer = document.querySelector('.js-mobile-drawer');
        setMobileMenuState(!(drawer && drawer.classList.contains('open')));
    } else if (closeBtn || overlay) {
        setMobileMenuState(false);
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') setMobileMenuState(false);
});

window.addEventListener('resize', function() {
    if (window.innerWidth > 1200) setMobileMenuState(false);
});

window.proErpCloseMobileMenu = function() {
    setMobileMenuState(false);
};

window.proErpCloseAllDropdowns = function() {
    document.querySelectorAll('.js-dropdown-container.open').forEach(function(el) { el.classList.remove('open'); });
    document.querySelectorAll('.js-dropdown-content.open').forEach(function(el) { el.classList.remove('open'); });
    document.querySelectorAll('.js-dropdown-arrow.open').forEach(function(el) { el.classList.remove('open'); });
    document.querySelectorAll('.js-dropdown-toggle.active').forEach(function(el) { el.classList.remove('active'); });
};

// ── Dynamic Sub-dropdown Max-Height ──────────────────────────────────────────
// Adjusts the max-height of sub-dropdowns so they never overflow the bottom of the screen.
document.addEventListener('mouseover', function (e) {
    var item = e.target.closest('.premium-dropdown-item.has-sub');
    if (item) {
        var subDropdown = item.querySelector('.premium-sub-dropdown');
        if (subDropdown) {
            var rect = item.getBoundingClientRect();
            var availableSpace = window.innerHeight - rect.top - 15; // 15px bottom padding
            subDropdown.style.maxHeight = Math.max(availableSpace, 100) + 'px';
        }
    }
});

// ── Context Menu Safari Fix Removed ────────────────────────────────────────────────

window.proErpPositionDropdown = function(wrapperId, panelId) {
    const wrapper = document.getElementById(wrapperId);
    const panel = document.getElementById(panelId);
    if (wrapper && panel) {
        const rect = wrapper.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.left = rect.left + 'px';
        panel.style.right = 'auto'; // Prevent RTL stretching
        
        // Ensure a minimum width so it doesn't look squished in small grid columns
        panel.style.width = Math.max(rect.width, 240) + 'px';
        panel.style.zIndex = '999999';

        // Smart Dropup/Dropdown logic
        const panelHeight = panel.offsetHeight || 250;
        const spaceBelow = window.innerHeight - rect.bottom;
        
        if (spaceBelow < panelHeight && rect.top > panelHeight) {
            // Drop UP
            panel.style.top = 'auto';
            panel.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
            panel.classList.add('dropup');
        } else {
            // Drop DOWN
            panel.style.top = (rect.bottom + 4) + 'px';
            panel.style.bottom = 'auto';
            panel.classList.remove('dropup');
        }
    }
};
