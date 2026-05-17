// ── Iconify Prefetch Bundle ──────────────────────────────────────────
// Preloads all icons used in the app in a single API call per icon set,
// instead of individual HTTP requests per icon.
// This dramatically reduces network requests on page load.

(function() {
    // Collect all unique icon prefixes used in the app
    const materialSymbols = [
        "account-balance-rounded","account-balance-wallet-rounded","account-tree-rounded",
        "add","add-circle-outline","add-circle-outline-rounded","add-rounded",
        "analytics-rounded","arrow-back-rounded","assignment-return",
        "av-timer-rounded","balance-rounded","bar-chart-rounded","barcode-scanner",
        "block","bolt-rounded","business-center-rounded","business-off-rounded","business-rounded",
        "check-circle","check-circle-rounded","chevron-left-rounded","close",
        "code-rounded","compare-arrows-rounded","dark-mode-rounded",
        "delete-outline","delete-outline-rounded","design-services-rounded",
        "edit-note-rounded","edit-rounded","engineering-rounded",
        "error-circle-rounded-outline","error-outline-rounded","event-available-rounded",
        "fact-check-outline-rounded","flag-rounded","folder-open-rounded","format-size-rounded",
        "group-off-rounded","groups-rounded","how-to-reg-rounded",
        "image-rounded","inbox-rounded","info-rounded",
        "inventory-2-outline","inventory-2-rounded",
        "keyboard-arrow-down-rounded","label-rounded","light-mode-rounded",
        "lock","lock-open","lock-person-rounded","lock-rounded","login-rounded","logout-rounded",
        "money-off-rounded","notes-rounded",
        "notifications-active-rounded","notifications-off-rounded","notifications-rounded",
        "open-in-new-rounded","password-rounded","payments-outline",
        "people-rounded","person","person-add-outline","person-rounded","person-search-outline",
        "play-circle-rounded","point-of-sale-rounded",
        "print","print-rounded",
        "receipt-long","receipt-long-outline-rounded","receipt-long-rounded",
        "remove","remove-shopping-cart",
        "savings-rounded","schedule-rounded","science-rounded","security-rounded","shield-rounded",
        "shopping-bag-rounded","shopping-cart-outline","shopping-cart-rounded",
        "support-agent-rounded","task-alt-rounded","touch-app-rounded",
        "trending-down-rounded","trending-up-rounded",
        "verified-rounded","visibility-rounded","warehouse-rounded","warning-rounded","work-rounded"
    ];

    const solarIcons = [
        "alt-arrow-left-linear","calendar-bold-duotone","headphones-round-bold-duotone",
        "user-circle-bold-duotone","verified-check-bold-duotone",
        "cart-large-bold-duotone","bag-3-bold-duotone","box-minimalistic-bold-duotone",
        "calculator-bold-duotone","users-group-rounded-bold-duotone","settings-bold-duotone",
        "wallet-2-bold-duotone","bill-list-bold-duotone","bill-bold-duotone",
        "round-arrow-left-bold-duotone","cart-check-bold-duotone","bus-bold-duotone",
        "widget-3-bold-duotone","box-bold-duotone","clipboard-check-bold-duotone",
        "home-2-bold-duotone","chart-square-bold-duotone","diagram-down-bold-duotone",
        "document-add-bold-duotone","scale-bold-duotone","safe-square-bold-duotone",
        "money-bag-bold-duotone","wad-of-money-bold-duotone","buildings-bold-duotone",
        "graph-down-bold-duotone","user-id-bold-duotone","clipboard-list-bold-duotone",
        "clock-circle-bold-duotone","tuning-square-2-bold-duotone",
        "hand-money-bold-duotone","transfer-horizontal-bold-duotone",
        "book-bookmark-bold-duotone","shield-check-bold-duotone",
        "document-text-bold-duotone","widget-5-bold-duotone","shop-bold-duotone",
        "record-circle-bold-duotone"
    ];

    // Build prefetch URLs (Iconify API supports batch requests)
    const msUrl = "https://api.iconify.design/material-symbols.json?icons=" + materialSymbols.join(",");
    const solarUrl = "https://api.iconify.design/solar.json?icons=" + solarIcons.join(",");

    // Prefetch both icon sets simultaneously
    Promise.all([
        fetch(msUrl).then(r => r.json()).catch(() => null),
        fetch(solarUrl).then(r => r.json()).catch(() => null)
    ]).then(([msData, solarData]) => {
        // Register icon data with Iconify if loaded
        if (window.Iconify) {
            if (msData) window.Iconify.addCollection(msData);
            if (solarData) window.Iconify.addCollection(solarData);
        }
    });
})();
