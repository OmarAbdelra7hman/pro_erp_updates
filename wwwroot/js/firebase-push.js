// ─── Firebase Push Notifications - Client Side ───
// Handles permission requests, FCM token retrieval, and foreground messages
// Called from Blazor via JS Interop

let firebaseApp = null;
let messaging = null;
let swRegistration = null;
let currentToken = null;

// Firebase config
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBtztV_JaDupVZzORUpeqtVdfnE6IhmymQ",
    authDomain: "mktoop-9cad6.firebaseapp.com",
    projectId: "mktoop-9cad6",
    storageBucket: "mktoop-9cad6.firebasestorage.app",
    messagingSenderId: "432820179070",
    appId: "1:432820179070:web:e91881c4771a19fe70882f"
};

window.firebasePush = {

    initialize: async function () {
        try {
            console.log('[FirebasePush] Starting initialization...');

            // Check if notifications are supported
            if (!('Notification' in window)) {
                console.warn('[FirebasePush] Notification API not available');
                return false;
            }
            console.log('[FirebasePush] Notification API available, permission:', Notification.permission);

            // Check if service workers are supported
            if (!('serviceWorker' in navigator)) {
                console.warn('[FirebasePush] Service workers not supported');
                return false;
            }
            console.log('[FirebasePush] Service workers supported');

            // Wait for Firebase SDK to load
            if (typeof firebase === 'undefined') {
                console.warn('[FirebasePush] Firebase SDK not loaded, waiting...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                if (typeof firebase === 'undefined') {
                    console.error('[FirebasePush] Firebase SDK still not loaded');
                    return false;
                }
            }

            // Initialize Firebase app (only once)
            if (!firebaseApp) {
                if (firebase.apps.length === 0) {
                    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
                } else {
                    firebaseApp = firebase.apps[0];
                }
                console.log('[FirebasePush] Firebase app initialized');
            }

            // Register the firebase messaging service worker
            try {
                swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                    scope: '/'
                });
                // Wait for the service worker to be ready
                await navigator.serviceWorker.ready;
                console.log('[FirebasePush] Firebase SW registered, scope:', swRegistration.scope);
            } catch (swError) {
                console.error('[FirebasePush] SW registration failed:', swError);
                return false;
            }

            // Initialize messaging
            try {
                messaging = firebase.messaging();
                console.log('[FirebasePush] Messaging initialized');
            } catch (msgError) {
                console.error('[FirebasePush] Messaging init failed:', msgError);
                return false;
            }

            console.log('[FirebasePush] Initialization complete!');
            return true;
        } catch (error) {
            console.error('[FirebasePush] Initialization error:', error);
            return false;
        }
    },

    getPermissionStatus: function () {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    },

    isInstalledPwa: function () {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    },

    requestPermissionAndGetToken: async function () {
        try {
            // Initialize if not already done
            if (!messaging) {
                const initialized = await this.initialize();
                if (!initialized) return null;
            }

            // Request permission
            console.log('[FirebasePush] Requesting notification permission...');
            const permission = await Notification.requestPermission();
            console.log('[FirebasePush] Permission result:', permission);

            if (permission !== 'granted') {
                console.warn('[FirebasePush] Notification permission denied');
                return null;
            }

            // Make sure SW registration is available
            if (!swRegistration) {
                swRegistration = await navigator.serviceWorker.getRegistration('/');
                if (!swRegistration) {
                    swRegistration = await navigator.serviceWorker.ready;
                }
            }

            // Get FCM token - pass the SW registration in options
            console.log('[FirebasePush] Getting FCM token...');
            try {
                currentToken = await messaging.getToken({
                    serviceWorkerRegistration: swRegistration
                });
            } catch (tokenError) {
                console.error('[FirebasePush] getToken error:', tokenError);
                // Retry without service worker registration
                try {
                    currentToken = await messaging.getToken();
                } catch (retryError) {
                    console.error('[FirebasePush] getToken retry failed:', retryError);
                    return null;
                }
            }

            if (currentToken) {
                console.log('[FirebasePush] FCM Token obtained:', currentToken.substring(0, 20) + '...');
            } else {
                console.warn('[FirebasePush] No FCM token available');
            }

            return currentToken;
        } catch (error) {
            console.error('[FirebasePush] Error getting token:', error);
            return null;
        }
    },

    setupForegroundHandler: function (dotNetHelper) {
        if (!messaging) return;

        messaging.onMessage((payload) => {
            console.log('[FirebasePush] Foreground message:', payload);

            // Notify Blazor
            if (dotNetHelper) {
                try {
                    dotNetHelper.invokeMethodAsync('OnPushNotificationReceived',
                        payload.notification?.title || payload.data?.title || '',
                        payload.notification?.body || payload.data?.message || '',
                        payload.data?.route || ''
                    );
                } catch (e) {
                    console.warn('[FirebasePush] Failed to notify Blazor:', e);
                }
            }

            // Also show browser notification if page is not visible
            if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
                new Notification(payload.notification?.title || 'mktoop', {
                    body: payload.notification?.body || '',
                    icon: '/icon-192.png',
                    dir: 'rtl',
                    lang: 'ar'
                });
            }
        });
    },

    getCurrentToken: function () {
        return currentToken;
    },

    deleteToken: async function () {
        if (messaging && currentToken) {
            try {
                await messaging.deleteToken();
                currentToken = null;
                console.log('[FirebasePush] Token deleted');
                return true;
            } catch (error) {
                console.error('[FirebasePush] Error deleting token:', error);
                return false;
            }
        }
        return false;
    }
};
