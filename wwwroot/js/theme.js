// ProERP Theme Helper  –  per-user, no-flash
window.themeHelper = {

    resolveTheme: function (username) {
        var theme = (username && localStorage.getItem('proerp_theme_' + username)) ||
            localStorage.getItem('proerp_theme_current') ||
            document.documentElement.getAttribute('data-theme') || 'dark';
        return theme === 'light' ? 'light' : 'dark';
    },

    applyToDocument: function (theme) {
        document.documentElement.setAttribute('data-theme', theme);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f7fb' : '#03173d');
    },

    // Called once after login to record the current user and apply their theme.
    // Returns the resolved theme string ('dark' | 'light').
    applyTheme: function (username) {
        try {
            if (username) localStorage.setItem('proerp_last_user', username);
            var theme = this.resolveTheme(username);
            localStorage.setItem('proerp_theme_current', theme);
            if (username && !localStorage.getItem('proerp_theme_' + username)) {
                localStorage.setItem('proerp_theme_' + username, theme);
            }
            this.applyToDocument(theme);
            return theme;
        } catch (e) { return 'dark'; }
    },

    // Called when the user clicks the toggle button.
    setTheme: function (username, theme) {
        try {
            theme = theme === 'light' ? 'light' : 'dark';
            if (username) {
                localStorage.setItem('proerp_theme_' + username, theme);
                localStorage.setItem('proerp_last_user', username);
            }
            localStorage.setItem('proerp_theme_current', theme);
            this.applyToDocument(theme);
        } catch (e) { }
    },

    // Utility: just read the stored preference without applying it.
    getTheme: function (username) {
        try {
            return this.resolveTheme(username);
        } catch (e) { return 'dark'; }
    }
};
