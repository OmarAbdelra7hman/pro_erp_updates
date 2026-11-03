// The component API lives on the constructor. Use it for the local bundle.
(() => {
    const api = customElements.get('iconify-icon');
    if (!api) throw new Error('The local icon component was not loaded.');
    window.Iconify = api;
    api._api.setFetch(() => Promise.reject(new Error('Only bundled local icons are allowed.')));
    api.disableCache('local');
    api.disableCache('session');
    api.addIcon('proerp:missing', {width:24,height:24,body:'<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.5-2.2 1.7-2.2 3.5M12 16v1"/></g>'});
    const ensureLocal = element => {
        const name=element.getAttribute('icon');
        if (!name || name[0]==='{') return;
        if (!api.iconExists(name)) {
            element.setAttribute('data-unavailable-icon',name);
            element.setAttribute('icon','proerp:missing');
        }
    };
    // Custom/database icons outside the shipped catalogue receive an explicit
    // local fallback, never an invisible icon or a remote lookup.
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('iconify-icon').forEach(ensureLocal);
        new MutationObserver(records => {
            for (const record of records) {
                if (record.type==='attributes') ensureLocal(record.target);
                else for (const node of record.addedNodes) if (node.nodeType===1) {
                    if (node.matches('iconify-icon')) ensureLocal(node);
                    node.querySelectorAll('iconify-icon').forEach(ensureLocal);
                }
            }
        }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['icon']});
    },{once:true});
})();
