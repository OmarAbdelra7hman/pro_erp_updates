let deferredPwaPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPwaPrompt = event;
    window.dispatchEvent(new CustomEvent('proerp-pwa-installable'));
});

window.addEventListener('appinstalled', () => {
    deferredPwaPrompt = null;
    window.dispatchEvent(new CustomEvent('proerp-pwa-installed'));
});

window.pwaApp = {
    isInstalled: function () {
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;
    },

    install: async function () {
        if (this.isInstalled()) return 'installed';
        if (deferredPwaPrompt) {
            deferredPwaPrompt.prompt();
            const choice = await deferredPwaPrompt.userChoice;
            deferredPwaPrompt = null;
            return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
        }

        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        if (isIos) return 'ios';
        return 'browser-menu';
    }
};
