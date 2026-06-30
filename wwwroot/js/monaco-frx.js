// Monaco Editor integration for FastReport FRX designer
let _monacoEditor = null;
let _monacoLoaderPromise = null;

function ensureMonacoLoader() {
    if (typeof window.require !== 'undefined') return Promise.resolve();
    if (_monacoLoaderPromise) return _monacoLoaderPromise;
    _monacoLoaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Monaco loader failed to load'));
        document.head.appendChild(script);
    });
    return _monacoLoaderPromise;
}

window.initMonacoEditor = async function (containerId, xmlContent) {
    try {
        await ensureMonacoLoader();
    } catch (error) {
        console.error('[Monaco] Loader error:', error);
        return;
    }
    let attempts = 0;

    function tryInit() {
        const container = document.getElementById(containerId);
        if (!container) {
            if (++attempts < 40) setTimeout(tryInit, 100);
            return;
        }

        // Make sure container has explicit dimensions
        container.style.width  = '100%';
        container.style.height = '65vh';
        container.style.minHeight = '400px';

        if (typeof require === 'undefined') {
            if (++attempts < 40) setTimeout(tryInit, 150);
            return;
        }

        // Dispose old editor
        if (_monacoEditor) {
            try { _monacoEditor.dispose(); } catch {}
            _monacoEditor = null;
        }
        container.innerHTML = '';

        require.config({
            paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
        });

        require(['vs/editor/editor.main'], function () {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

            _monacoEditor = monaco.editor.create(container, {
                value: xmlContent || '',
                language: 'xml',
                theme: isDark ? 'vs-dark' : 'vs',
                fontSize: 13,
                fontFamily: "'Cascadia Code', 'Fira Code', 'Courier New', monospace",
                minimap: { enabled: false },
                wordWrap: 'on',
                automaticLayout: false,   // manual control
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                lineNumbers: 'on',
                folding: true,
            });

            // Force layout after render
            function forceLayout() {
                if (_monacoEditor && container.offsetWidth > 0) {
                    _monacoEditor.layout({
                        width: container.offsetWidth,
                        height: container.offsetHeight || 500
                    });
                } else {
                    setTimeout(forceLayout, 100);
                }
            }
            setTimeout(forceLayout, 50);
            setTimeout(forceLayout, 300);
            setTimeout(forceLayout, 800);

            // Also handle window resize
            window.addEventListener('resize', () => {
                if (_monacoEditor) {
                    _monacoEditor.layout({
                        width: container.offsetWidth,
                        height: container.offsetHeight || 500
                    });
                }
            });
        });
    }

    tryInit();
};

window.getMonacoValue = function () {
    return _monacoEditor ? _monacoEditor.getValue() : '';
};

window.formatMonacoXml = function () {
    if (!_monacoEditor) return;
    _monacoEditor.getAction('editor.action.formatDocument').run();
};

window.setMonacoTheme = function (isDark) {
    if (typeof monaco !== 'undefined') {
        monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
    }
};
