// ─── Firebase Messaging Service Worker ───
// Receives push notifications when the app is in the background or closed

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBtztV_JaDupVZzORUpeqtVdfnE6IhmymQ",
    authDomain: "mktoop-9cad6.firebaseapp.com",
    projectId: "mktoop-9cad6",
    storageBucket: "mktoop-9cad6.firebasestorage.app",
    messagingSenderId: "432820179070",
    appId: "1:432820179070:web:e91881c4771a19fe70882f"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw] Background message received:', payload);

    const notificationTitle = payload.notification?.title || payload.data?.title || 'mktoop';
    const notificationOptions = {
        body: payload.notification?.body || payload.data?.message || '',
        icon: payload.notification?.icon || '/icon-192.png',
        badge: '/icon-192.png',
        dir: 'rtl',
        lang: 'ar',
        tag: payload.data?.payloadId || 'mktoop-notification',
        renotify: true,
        data: {
            url: payload.data?.route || '/',
            payloadId: payload.data?.payloadId || ''
        },
        actions: [
            { action: 'open', title: 'فتح' },
            { action: 'dismiss', title: 'تجاهل' }
        ]
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw] Notification click:', event.action);
    event.notification.close();

    if (event.action === 'dismiss') return;

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing window if available
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    if (urlToOpen !== '/') {
                        client.navigate(urlToOpen);
                    }
                    return;
                }
            }
            // Open new window
            return clients.openWindow(urlToOpen);
        })
    );
});
