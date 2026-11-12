// This database is deliberately separate from the legacy POS store. It never
// imports old unowned queues or caches other users' credentials/PIN hashes.
const DB_NAME = 'mktoop-offline-workspace-v1';
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const un64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const aad = (profile, purpose) => enc.encode(`${location.origin}|${profile}|${purpose}`);
const loginRequired = message => Object.assign(new Error(message), { requiresLogin:true });

export async function derivePinKey(pin, salt) {
    const material = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name:'PBKDF2', salt:un64(salt), iterations:310000, hash:'SHA-256' },
        material, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
export async function seal(key, value, profile, purpose) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name:'AES-GCM', iv, additionalData:aad(profile,purpose) },
        key, enc.encode(JSON.stringify(value)));
    return { iv:b64(iv), data:b64(data) };
}
export async function open(key, value, profile, purpose) {
    const raw = await crypto.subtle.decrypt({ name:'AES-GCM', iv:un64(value.iv), additionalData:aad(profile,purpose) }, key, un64(value.data));
    return JSON.parse(dec.decode(raw));
}
async function database() {
    return new Promise((resolve,reject) => {
        const request = indexedDB.open(DB_NAME,1);
        request.onupgradeneeded = () => {
            const db=request.result;
            db.createObjectStore('profiles',{keyPath:'id'});
            db.createObjectStore('snapshots',{keyPath:'profile'});
            const queue=db.createObjectStore('queue',{keyPath:['profile','id']});
            queue.createIndex('profile','profile');
        };
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{ request.result.onversionchange=()=>request.result.close(); resolve(request.result); };
        request.onblocked=()=>reject(new Error('اقفل النسخ القديمة من التطبيق وأعد المحاولة.'));
    });
}
// Resolve only after transaction commit (not IDBRequest.success): quota failures
// must never look like a successfully saved financial document.
async function transaction(stores, mode, action) {
    const db=await database();
    try {
        return await new Promise((resolve,reject)=>{
            const tx=db.transaction(stores,mode); let result;
            tx.oncomplete=()=>resolve(result);
            tx.onabort=()=>reject(tx.error || new Error('تعذر حفظ البيانات محليًا.'));
            tx.onerror=()=>{};
            try { action(tx,value=>result=value); } catch(error) { tx.abort(); reject(error); }
        });
    } finally { db.close(); }
}
async function read(store,key) {
    return transaction([store],'readonly',(tx,set)=>{
        const request=tx.objectStore(store).get(key); request.onsuccess=()=>set(request.result);
    });
}
export const profiles = () => transaction(['profiles'],'readonly',(tx,set)=>{
    const request=tx.objectStore('profiles').getAll(); request.onsuccess=()=>set(request.result);
});
export function canCreate(snapshot, now=Date.now()) {
    return now >= Date.parse(snapshot.issuedAt)-300000 && now <= Date.parse(snapshot.expiresAt);
}
export class Vault {
    profile=null; snapshot=null; key=null;
    lock() { this.profile=null; this.snapshot=null; this.key=null; }
    async unlock(profileId,pin) {
        this.lock();
        const profile=await read('profiles',profileId);
        if(!profile || profile.origin!==location.origin) throw new Error('بيانات الجهاز مش متاحة. جهّزه أونلاين أولًا.');
        let key,snapshot;
        try {
            const pinKey=await derivePinKey(pin,profile.salt);
            const raw=await open(pinKey,profile.wrappedKey,profile.id,'key');
            key=await crypto.subtle.importKey('raw',un64(raw),'AES-GCM',false,['encrypt','decrypt']);
            const cached=await read('snapshots',profile.id);
            snapshot=await open(key,cached.cipher,profile.id,'snapshot');
        } catch { throw new Error('رمز الفتح غير صحيح، أو البيانات المحلية غير سليمة.'); }
        if(snapshot.profileId!==profile.id || snapshot.userId!==profile.userId || snapshot.database!==profile.database)
            throw new Error('هوية البيانات المحلية غير متطابقة.');
        this.profile=profile; this.key=key; this.snapshot=snapshot;
    }
    async enroll(snapshot,pin) {
        if(!/^\d{8,12}$/.test(pin)) throw new Error('استخدم رمز فتح من ٨ إلى ١٢ رقم.');
        const existing=await read('profiles',snapshot.profileId);
        if(existing) {
            // A refresh never destroys or re-encrypts another queue with a new key.
            if(this.profile?.id!==existing.id) await this.unlock(existing.id,pin);
            const cipher=await seal(this.key,snapshot,existing.id,'snapshot');
            await transaction(['snapshots'],'readwrite',tx=>tx.objectStore('snapshots').put({profile:existing.id,cipher}));
            this.snapshot=snapshot;
            return;
        }
        const salt=b64(crypto.getRandomValues(new Uint8Array(16)));
        const raw=crypto.getRandomValues(new Uint8Array(32));
        const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
        const pinKey=await derivePinKey(pin,salt);
        const profile={id:snapshot.profileId,userId:snapshot.userId,database:snapshot.database,name:snapshot.name,
            origin:location.origin,salt,wrappedKey:await seal(pinKey,b64(raw),snapshot.profileId,'key')};
        raw.fill(0);
        const cipher=await seal(key,snapshot,profile.id,'snapshot');
        await transaction(['profiles','snapshots'],'readwrite',tx=>{
            tx.objectStore('profiles').add(profile);
            tx.objectStore('snapshots').add({profile:profile.id,cipher});
        });
        this.profile=profile; this.key=key; this.snapshot=snapshot;
        await navigator.storage?.persist?.().catch(()=>false);
    }
    requireUnlocked() { if(!this.key || !this.profile) throw new Error('افتح المستخدم بالرمز المحلي أولًا.'); }
    async enqueue(route,payload) {
        this.requireUnlocked();
        if(!canCreate(this.snapshot)) throw new Error('مدة الأوفلاين انتهت أو ساعة الجهاز غير صحيحة. جدّد التجهيز أونلاين.');
        if(!this.snapshot.screens.some(x=>x.route===route)) throw new Error('الشاشة مش مسموحة دون اتصال.');
        const id=crypto.randomUUID(), createdAt=new Date().toISOString(), profile=this.profile.id;
        const value={id,createdAt,route,payload,grant:this.snapshot.grant,state:'pending',error:null};
        const cipher=await seal(this.key,value,profile,`queue:${id}`);
        await transaction(['queue'],'readwrite',tx=>tx.objectStore('queue').add({profile,id,cipher}));
        return value;
    }
    async queue() {
        this.requireUnlocked(); const profile=this.profile.id, key=this.key;
        const rows=await transaction(['queue'],'readonly',(tx,set)=>{
            const r=tx.objectStore('queue').index('profile').getAll(profile); r.onsuccess=()=>set(r.result);
        });
        const values=await Promise.all(rows.map(r=>open(key,r.cipher,profile,`queue:${r.id}`)));
        return values.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    }
    async updateOperation(value) {
        this.requireUnlocked(); const profile=this.profile.id;
        const cipher=await seal(this.key,value,profile,`queue:${value.id}`);
        await transaction(['queue'],'readwrite',tx=>tx.objectStore('queue').put({profile,id:value.id,cipher}));
    }
    async sync(fetcher=fetch) {
        this.requireUnlocked();
        const profile=this.profile, key=this.key;
        const run=async()=>{
            const response=await fetcher('/api/offline-workspace/session',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
            if(!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw loginRequired('سجّل دخولك أونلاين بنفس المستخدم قبل الترحيل.');
            const session=await response.json();
            if(session.userId!==profile.userId || session.database!==profile.database)
                throw loginRequired('المستخدم المتصل مختلف. مش هنرحّل عمليات باسم مستخدم تاني.');
            if(this.key!==key || this.profile!==profile) return 0;
            let synced=0;
            for(const operation of await this.queue()) {
                if(this.key!==key || this.profile!==profile) break;
                if(operation.state==='synced' || operation.state==='review') continue;
                let result;
                try {
                    result=await fetcher('/api/offline-workspace/replay',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
                        headers:{'Content-Type':'application/json','RequestVerificationToken':session.csrf},
                        body:JSON.stringify({grant:operation.grant,id:operation.id,createdAt:operation.createdAt,route:operation.route,payload:operation.payload}),
                        signal:AbortSignal.timeout(30000)});
                } catch { break; } // Unknown outcome: retain the SAME id for retry.
                if(result.status===401) throw loginRequired('جلسة الدخول انتهت. سجّل بنفس المستخدم قبل الترحيل.');
                let body; try { body=await result.json(); } catch { break; }
                // Lock/account switch may happen while an HTTP request is in
                // flight. Keep the original queue intact for an idempotent retry.
                if(this.key!==key || this.profile!==profile) break;
                if(result.ok && Number.isInteger(body.id) && body.id>0) {
                    operation.state='synced'; operation.serverId=body.id; operation.syncedAt=new Date().toISOString(); operation.error=null; synced++;
                } else {
                    operation.error=body.error || 'تعذر ترحيل العملية.';
                    if([400,403,409,422].includes(result.status)) operation.state='review';
                    else break;
                }
                await this.updateOperation(operation);
            }
            return synced;
        };
        // Serialize tabs and window reload recovery; server unique key remains
        // authoritative even where Web Locks isn't supported.
        return navigator.locks ? navigator.locks.request(`mktoop-sync:${profile.id}`,run) : run();
    }
}
