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

    getStatus: function () {
        const installed = window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const secure = window.isSecureContext;
        const hasNotificationApi = 'Notification' in window;
        const hasServiceWorker = 'serviceWorker' in navigator;

        let reason = '';
        if (!secure) reason = 'insecure';
        else if (!hasNotificationApi) reason = isIos && !installed ? 'ios-not-installed' : 'notification-unsupported';
        else if (!hasServiceWorker) reason = 'service-worker-unsupported';

        return {
            supported: secure && hasNotificationApi && hasServiceWorker,
            secureContext: secure,
            installedPwa: installed,
            isIos: isIos,
            permission: hasNotificationApi ? Notification.permission : 'unsupported',
            reason: reason
        };
    },

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

            // Use the same root service worker as the PWA. A second worker with
            // scope "/" would replace the PWA worker and break installation/cache.
            try {
                swRegistration = await navigator.serviceWorker.register('/service-worker.js', {
                    scope: '/',
                    updateViaCache: 'none'
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
        if (!window.isSecureContext || !('Notification' in window)) return 'unsupported';
        return Notification.permission;
    },

    isInstalledPwa: function () {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    },

    requestPermissionAndGetToken: async function () {
        try {
            // Permission must be the FIRST awaited browser operation. Safari/iOS
            // drops transient user activation if Firebase/SW initialization runs first.
            console.log('[FirebasePush] Requesting notification permission...');
            const permission = await Notification.requestPermission();
            console.log('[FirebasePush] Permission result:', permission);

            if (permission !== 'granted') {
                console.warn('[FirebasePush] Notification permission denied');
                return null;
            }

            // Initialize only after permission has been granted.
            if (!messaging) {
                const initialized = await window.firebasePush.initialize();
                if (!initialized) return null;
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

    enableFromUserGesture: async function () {
        const status = window.firebasePush.getStatus();
        if (!status.secureContext) {
            return { success: false, status: 'insecure', message: 'الإشعارات تحتاج HTTPS آمن.' };
        }
        if (!status.supported) {
            return {
                success: false,
                status: status.reason || 'unsupported',
                message: status.reason === 'ios-not-installed'
                    ? 'ثبّت التطبيق على الشاشة الرئيسية وافتحه من الأيقونة أولاً.'
                    : 'الإشعارات غير مدعومة على هذا المتصفح.'
            };
        }
        if (status.permission === 'denied') {
            return { success: false, status: 'denied', message: 'الإشعارات محظورة من إعدادات الجهاز.' };
        }

        // Keep this call before every other asynchronous setup operation.
        let permission = status.permission;
        if (permission === 'default') {
            permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') {
            return { success: false, status: permission, message: 'لم يتم منح إذن الإشعارات.' };
        }

        // The web app uses the browser-standard Push API. Flutter/mobile keeps
        // using FCM through the same server notification service.
        return await window.firebasePush.subscribeStandardWebPush();
    },

    subscribeStandardWebPush: async function () {
        try {
            let registration = swRegistration || await navigator.serviceWorker.getRegistration('/');
            if (!registration) {
                registration = await navigator.serviceWorker.register('/service-worker.js', {
                    scope: '/', updateViaCache: 'none'
                });
            }
            await navigator.serviceWorker.ready;

            const keyResponse = await fetch('/api/web-push/public-key', {
                credentials: 'same-origin', cache: 'no-store'
            });
            if (!keyResponse.ok) {
                return { success: false, status: 'web-push-key-failed', message: 'تعذر قراءة مفتاح Web Push من الخادم.' };
            }
            const keyData = await keyResponse.json();
            const applicationServerKey = window.firebasePush.urlBase64ToUint8Array(keyData.publicKey);
            let subscription = await registration.pushManager.getSubscription();
            const existingKey = subscription?.options?.applicationServerKey;
            if (subscription && existingKey && !window.firebasePush.uint8ArraysEqual(
                new Uint8Array(existingKey), applicationServerKey)) {
                await subscription.unsubscribe();
                subscription = null;
            }
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey
                });
            }

            const json = subscription.toJSON();
            const saveResponse = await fetch('/api/web-push/subscribe', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: subscription.endpoint,
                    p256dh: json.keys?.p256dh || '',
                    auth: json.keys?.auth || ''
                })
            });
            if (!saveResponse.ok) {
                return { success: false, status: 'web-push-save-failed', message: 'تعذر حفظ اشتراك Safari على الخادم.' };
            }
            return { success: true, status: 'web-push-granted', message: 'تم تفعيل إشعارات Safari.' };
        } catch (error) {
            console.error('[WebPush] Subscription failed:', error);
            return { success: false, status: 'web-push-failed', message: 'تعذر إنشاء اشتراك Web Push على Safari.' };
        }
    },

    urlBase64ToUint8Array: function (base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
    },

    uint8ArraysEqual: function (left, right) {
        return left.length === right.length && left.every((value, index) => value === right[index]);
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
