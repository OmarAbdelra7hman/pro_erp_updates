window.proErpDb = {
    db: null,
    init: function () {
        return new Promise((resolve, reject) => {
            let request = indexedDB.open("ProErpOfflineDB", 4);
            request.onerror = event => reject("DB Error: " + event.target.error);
            request.onsuccess = event => {
                window.proErpDb.db = event.target.result;
                resolve(true);
            };
            request.onupgradeneeded = event => {
                let db = event.target.result;
                if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { autoIncrement: true });
                if (!db.objectStoreNames.contains("customers")) db.createObjectStore("customers", { autoIncrement: true });
                if (!db.objectStoreNames.contains("invoices_queue")) db.createObjectStore("invoices_queue", { autoIncrement: true });
                if (!db.objectStoreNames.contains("users")) db.createObjectStore("users", { autoIncrement: true });
                if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { autoIncrement: true });
            };
        });
    },
    saveData: function (storeName, dataArray) {
        return new Promise((resolve, reject) => {
            let tx = window.proErpDb.db.transaction(storeName, "readwrite");
            let store = tx.objectStore(storeName);
            store.clear(); 
            dataArray.forEach(item => store.put(item));
            tx.oncomplete = () => resolve(true);
            tx.onerror = event => reject(event.target.error);
        });
    },
    getData: function(storeName) {
        return new Promise((resolve, reject) => {
            let tx = window.proErpDb.db.transaction(storeName, "readonly");
            let store = tx.objectStore(storeName);
            let request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = event => reject(event.target.error);
        });
    },
    enqueueInvoice: function(invoice) {
        return new Promise((resolve, reject) => {
            let tx = window.proErpDb.db.transaction("invoices_queue", "readwrite");
            let store = tx.objectStore("invoices_queue");
            store.add(invoice);
            tx.oncomplete = () => resolve(true);
            tx.onerror = event => reject(event.target.error);
        });
    },
    getQueuedInvoices: function() {
        return new Promise((resolve, reject) => {
            let tx = window.proErpDb.db.transaction("invoices_queue", "readonly");
            let store = tx.objectStore("invoices_queue");
            let request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = event => reject(event.target.error);
        });
    },
    getQueuedInvoicesCount: function() {
        return new Promise((resolve, reject) => {
            let tx = window.proErpDb.db.transaction("invoices_queue", "readonly");
            let store = tx.objectStore("invoices_queue");
            let request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = event => reject(event.target.error);
        });
    },
    clearQueuedInvoices: function() {
        return new Promise((resolve, reject) => {
            let tx = window.proErpDb.db.transaction("invoices_queue", "readwrite");
            let store = tx.objectStore("invoices_queue");
            store.clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = event => reject(event.target.error);
        });
    }
};
