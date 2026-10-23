(() => {
    const bars = new WeakMap();
    window.proErpTabs = {
        attach(bar, receiver) {
            if (!bar || bars.has(bar)) return;
            bars.set(bar, true);
            let source = null, target = null, after = false;
            const clearTarget = () => {
                target?.classList.remove('drop-before', 'drop-after');
                target = null;
            };
            const finish = () => {
                source?.classList.remove('is-dragging');
                source = null;
                clearTarget();
            };
            bar.addEventListener('dragstart', event => {
                const item = event.target.closest('[data-tab-id]');
                if (!item || event.target.closest('.erp-tab-close')) { event.preventDefault(); return; }
                source = item;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.dataset.tabId);
                item.classList.add('is-dragging');
            });
            bar.addEventListener('dragover', event => {
                if (!source) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const item = event.target.closest('[data-tab-id]');
                clearTarget();
                if (!item || item === source) return;
                target = item;
                const rect = item.getBoundingClientRect();
                const rtl = getComputedStyle(bar).direction === 'rtl';
                after = rtl ? event.clientX < rect.left + rect.width / 2 : event.clientX > rect.left + rect.width / 2;
                target.classList.add(after ? 'drop-after' : 'drop-before');
                // Scroll the strip only while dragging near its edges.
                const bounds = bar.getBoundingClientRect();
                if (event.clientX < bounds.left + 28) bar.scrollBy({ left: -24 });
                else if (event.clientX > bounds.right - 28) bar.scrollBy({ left: 24 });
            });
            bar.addEventListener('drop', event => {
                if (!source) return;
                event.preventDefault();
                const from = source.dataset.tabId, to = target?.dataset.tabId, insertAfter = after;
                finish();
                if (to) receiver.invokeMethodAsync('ReorderTab', from, to, insertAfter).catch(() => {});
            });
            bar.addEventListener('dragend', finish);
            bar.addEventListener('dragleave', event => { if (!bar.contains(event.relatedTarget)) clearTarget(); });
            let previousActive;
            const reveal = () => {
                const active = bar.querySelector('.erp-tab-item.active');
                if (active && active !== previousActive && !source) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                previousActive = active;
            };
            // Observe just the strip, not the expensive page content.
            const observer = new MutationObserver(() => {
                if (!bar.isConnected) { observer.disconnect(); return; }
                reveal();
            });
            observer.observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
            reveal();
        }
    };
})();
