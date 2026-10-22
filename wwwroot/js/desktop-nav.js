// Opening menus is local; only navigation to a screen reaches Blazor.
(() => {
    const hoverOpenTimers = new Map(), hoverCloseTimers = new Map();
    function cancelHover(branch) {
        for (const timers of [hoverOpenTimers, hoverCloseTimers]) {
            for (const [item, timer] of timers) {
                if (item === branch || branch.contains(item)) { clearTimeout(timer); timers.delete(item); }
            }
        }
    }
    const triggerOf = branch => branch?.querySelector(':scope > [data-nav-trigger]');
    const panelOf = branch => branch?.querySelector(':scope > [data-nav-panel]');
    function close(branch) {
        if (!branch) return;
        cancelHover(branch);
        branch.querySelectorAll('[data-nav-trigger]').forEach(t => t.setAttribute('aria-expanded', 'false'));
        branch.querySelectorAll('[data-nav-panel]').forEach(p => p.classList.remove('open'));
        branch.querySelectorAll('.nav-branch.open').forEach(b => b.classList.remove('open'));
        branch.classList.remove('open');
    }
    window.proErpCloseDesktopMenus = () => document.querySelectorAll('[data-desktop-nav]').forEach(close);
    function open(trigger) {
        const branch = trigger.parentElement, panel = panelOf(branch);
        if (!panel) return;
        if (trigger.getAttribute('aria-expanded') === 'true') return;
        Array.from(branch.parentElement.children).filter(b => b !== branch && b.classList.contains('nav-branch')).forEach(close);
        const rect = trigger.getBoundingClientRect();
        const width = Math.min(244, window.innerWidth - 16);
        const isSub = !!branch.parentElement.closest('[data-nav-panel]');
        let left = isSub ? rect.left - width - 4 : rect.right - width;
        if (isSub && left < 8) left = rect.right + 4;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        const top = Math.max(8, Math.min(isSub ? rect.top : rect.bottom + 8, window.innerHeight - 80));
        Object.assign(panel.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${window.innerHeight - top - 8}px` });
        branch.classList.add('open'); panel.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
    }
    const buttons = panel => Array.from(panel.querySelectorAll(':scope > button, :scope > .nav-branch > button'));
    document.addEventListener('pointerover', e => {
        if (e.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        const branch = e.target.closest('[data-desktop-nav] .nav-branch');
        if (!branch) return;
        const parentPanel = branch.parentElement.closest('[data-nav-panel]');
        // Top-level sections are click-only; hover is for visible submenu rows.
        if (!parentPanel || !parentPanel.classList.contains('open')) return;
        // Keep ancestors open while crossing the small gap into their flyout.
        for (let ancestor = branch; ancestor; ancestor = ancestor.parentElement?.closest('.nav-branch')) {
            clearTimeout(hoverCloseTimers.get(ancestor)); hoverCloseTimers.delete(ancestor);
        }
        if (branch.contains(e.relatedTarget)) return;
        clearTimeout(hoverOpenTimers.get(branch));
        hoverOpenTimers.set(branch, setTimeout(() => {
            hoverOpenTimers.delete(branch);
            if (!branch.isConnected || !parentPanel.classList.contains('open')) return;
            const trigger = triggerOf(branch);
            if (trigger) open(trigger);
            else Array.from(branch.parentElement.children).filter(b => b !== branch && b.classList.contains('nav-branch')).forEach(close);
        }, 150));
    });
    document.addEventListener('pointerout', e => {
        if (e.pointerType !== 'mouse') return;
        const nav = e.target.closest('[data-desktop-nav]');
        if (!nav) return;
        // Close flyouts on mouse leave, but keep the clicked root menu open.
        for (let branch = e.target.closest('.nav-branch'); branch && nav.contains(branch); branch = branch.parentElement?.closest('.nav-branch')) {
            if (!branch.parentElement.closest('[data-nav-panel]')) continue;
            if (branch.contains(e.relatedTarget)) continue;
            clearTimeout(hoverOpenTimers.get(branch)); hoverOpenTimers.delete(branch);
            clearTimeout(hoverCloseTimers.get(branch));
            const leaving = branch;
            hoverCloseTimers.set(branch, setTimeout(() => { hoverCloseTimers.delete(leaving); close(leaving); }, 280));
        }
    });
    document.addEventListener('click', e => {
        const nav = e.target.closest('[data-desktop-nav]');
        if (!nav) { window.proErpCloseDesktopMenus(); return; }
        cancelHover(nav);
        const trigger = e.target.closest('[data-nav-trigger]');
        if (trigger) {
            if (trigger.getAttribute('aria-expanded') === 'true') close(trigger.parentElement);
            else open(trigger);
        } else if (e.target.closest('button')) window.proErpCloseDesktopMenus();
    });
    document.addEventListener('keydown', e => {
        const nav = e.target.closest('[data-desktop-nav]');
        if (!nav) return;
        cancelHover(nav);
        const button = e.target.closest('button');
        if (!button) return;
        const panel = button.closest('[data-nav-panel]'), trigger = button.matches('[data-nav-trigger]');
        if (e.key === 'Escape' || (e.key === 'ArrowRight' && panel)) {
            e.preventDefault();
            const branch = panel ? panel.parentElement : button.parentElement;
            close(branch); triggerOf(branch)?.focus();
        } else if ((e.key === 'ArrowLeft' && panel || !panel && e.key === 'ArrowDown') && trigger) {
            e.preventDefault(); open(button); buttons(panelOf(button.parentElement))[0]?.focus();
        } else if (panel && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            const items = buttons(panel), index = items.indexOf(button);
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
        } else if (!panel && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const items = Array.from(nav.querySelectorAll(':scope > .nav-branch > button')), index = items.indexOf(button);
            items[(index + (e.key === 'ArrowLeft' ? 1 : -1) + items.length) % items.length]?.focus();
        }
    });
    document.addEventListener('focusout', e => {
        const nav = e.target.closest('[data-desktop-nav]');
        if (nav && !nav.contains(e.relatedTarget)) close(nav);
    });
    document.addEventListener('scroll', e => {
        const panel = e.target.closest?.('[data-desktop-nav] [data-nav-panel]');
        if (panel) panel.querySelectorAll(':scope > .nav-branch').forEach(close);
    }, { capture: true, passive: true });
    window.addEventListener('resize', window.proErpCloseDesktopMenus, { passive: true });
})();
