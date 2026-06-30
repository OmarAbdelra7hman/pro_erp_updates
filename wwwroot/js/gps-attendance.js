window.gpsAttendance = {
    getSupportInfo: function () {
        return {
            supported: 'geolocation' in navigator,
            secureContext: window.isSecureContext
        };
    },

    getCurrentPosition: function () {
        return new Promise((resolve) => {
            if (!window.isSecureContext) {
                resolve({ success: false, message: 'تحديد الموقع يحتاج اتصال HTTPS آمن.' });
                return;
            }
            if (!('geolocation' in navigator)) {
                resolve({ success: false, message: 'المتصفح لا يدعم تحديد الموقع الجغرافي.' });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => resolve({
                    success: true,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: Math.round(position.coords.accuracy),
                    capturedAt: new Date(position.timestamp).toISOString()
                }),
                (error) => {
                    const messages = {
                        1: 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح ثم حاول مرة أخرى.',
                        2: 'تعذر تحديد موقعك الحالي. تأكد من تشغيل خدمة الموقع.',
                        3: 'استغرق تحديد الموقع وقتًا طويلًا. حاول مرة أخرى في مكان مفتوح.'
                    };
                    resolve({ success: false, message: messages[error.code] || 'تعذر الحصول على الموقع الجغرافي.' });
                },
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        });
    }
};
