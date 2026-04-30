// ProERP Theme Helper  –  per-user, no-flash
window.themeHelper = {

    // Called once after login to record the current user and apply their theme.
    // Returns the resolved theme string ('dark' | 'light').
    applyTheme: function (username) {
        try {
            if (username) localStorage.setItem('proerp_last_user', username);
            var theme = (username && localStorage.getItem('proerp_theme_' + username)) || 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            return theme;
        } catch (e) { return 'dark'; }
    },

    // Called when the user clicks the toggle button.
    setTheme: function (username, theme) {
        try {
            if (username) {
                localStorage.setItem('proerp_theme_' + username, theme);
                localStorage.setItem('proerp_last_user', username);
            }
            document.documentElement.setAttribute('data-theme', theme);
        } catch (e) { }
    },

    // Utility: just read the stored preference without applying it.
    getTheme: function (username) {
        try {
            return (username && localStorage.getItem('proerp_theme_' + username)) || 'dark';
        } catch (e) { return 'dark'; }
    }
};
