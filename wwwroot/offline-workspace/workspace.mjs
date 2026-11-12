import {Vault,profiles,canCreate} from './vault.mjs';
const vault=new Vault(), app=document.querySelector('#app'), notice=document.querySelector('#notice');
let busy=false, syncBusy=false, selectedRoute=null, draft=null, selectedScreen=null, failedUnlocks=0, unlockAfter=0;
let retryTimer=null, retryDelay=30000;
const h=(tag,attrs={},...children)=>{
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)) {
        if(key.startsWith('on')) node.addEventListener(key.slice(2),value);
        else if(key==='class') node.className=value;
        else if(key==='text') node.textContent=value;
        else if(value!==undefined && value!==null) node.setAttribute(key,String(value));
    }
    for(const child of children.flat()) if(child!=null) node.append(child instanceof Node?child:document.createTextNode(String(child)));
    return node;
};
function message(text,error=false){notice.textContent=text;notice.classList.toggle('error',error);}
function button(text,action,primary=false){return h('button',{type:'button',class:primary?'primary':'',onclick:()=>guard(action)},text);}
function errorMessage(error){
    if(error.name==='QuotaExceededError')return 'مساحة التخزين على الجهاز مش كافية. الحفظ ما اكتملش؛ ما تقفلش المستند قبل توفير مساحة.';
    if(['TimeoutError','AbortError'].includes(error.name))return 'الاتصال أخد وقت أطول من المتوقع. البيانات المحلية لسه محفوظة.';
    if(error instanceof TypeError)return 'تعذر الوصول للسيرفر حاليًا. تأكد من الاتصال وأعد المحاولة.';
    return error.message||'تعذر إتمام العملية.';
}
async function guard(action){if(busy)return;busy=true;try{await action();}catch(error){message(errorMessage(error),true);}finally{busy=false;}}
function field(text,control){return h('label',{},text,control);}
function input(type,value,change,attrs={}){const el=h('input',{type,value,...attrs});el.addEventListener('change',()=>change(type==='number'?Number(el.value):el.value));return el;}
function select(rows,value,change,empty='اختار…'){
    const el=h('select',{},h('option',{value:''},empty),rows.map(row=>h('option',{value:row.id},row.name)));
    el.value=value||'';el.addEventListener('change',()=>change(Number(el.value)||null));return el;
}
function localDate(){const d=new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function money(value){return Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+vault.snapshot.currency;}
function updateIdentity(){document.querySelector('#identity').textContent=vault.profile?.name||'';document.querySelector('#lock').hidden=!vault.profile;}
function loginLink(){return h('a',{href:'/login?ReturnUrl=%2Foffline-workspace%2Findex.html',class:'button'},'تسجيل الدخول أونلاين');}
async function prepareShell(){
    if(!isSecureContext || !('serviceWorker' in navigator) || !crypto.subtle) throw new Error('تجهيز الأوفلاين محتاج HTTPS أو localhost ومتصفح داعم.');
    const registration=await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});
    const worker=registration.installing||registration.waiting;
    if(worker && worker.state!=='activated')await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('تشغيل ملفات الأوفلاين لسه ما اكتملش. أعد التجهيز.')),30000);
        worker.addEventListener('statechange',()=>{
            if(worker.state==='activated'){clearTimeout(timeout);resolve();}
            if(worker.state==='redundant'){clearTimeout(timeout);reject(new Error('تعذر تشغيل ملفات الأوفلاين.'));}
        });
    });
    await navigator.serviceWorker.ready;
    const assets=['/offline-workspace/index.html','/offline-workspace/workspace.css','/offline-workspace/vault.mjs','/offline-workspace/workspace.mjs'];
    // A complete shell is required before declaring the device ready.
    const cache=await caches.open('mktoop-offline-shell-v1');
    for(const path of assets){const response=await fetch(path,{cache:'reload'});if(!response.ok)throw new Error('ملفات الأوفلاين ما اكتملتش. أعد التجهيز.');await cache.put(path,response);}
}
async function enrollment(){
    message('جاري التحقق من المستخدم المتصل وتجهيز بياناته…');
    let device=localStorage.getItem('mktoop-offline-device');
    if(!device){device=crypto.randomUUID();localStorage.setItem('mktoop-offline-device',device);}
    const response=await fetch(`/api/offline-workspace/snapshot?device=${encodeURIComponent(device)}`,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000)});
    if(!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('سجّل دخولك أونلاين الأول، وتأكد من صلاحياتك.');
    const snapshot=await response.json(), existing=(await profiles()).some(x=>x.id===snapshot.profileId);
    app.replaceChildren();
    const pin=input('password','',()=>{},{inputmode:'numeric',autocomplete:existing?'current-password':'new-password',minlength:8,maxlength:12,required:true});
    const confirmation=input('password','',()=>{},{inputmode:'numeric',autocomplete:'new-password',minlength:8,maxlength:12,required:true});
    const form=h('form',{class:'card unlock stack'},h('h1',{},`${existing?'تجديد':'تفعيل'} الأوفلاين — ${snapshot.name}`),
        h('p',{class:'muted'},'الجهاز هيحتفظ بنسخة محلية مشفّرة. استخدم رمز فتح من ٨ إلى ١٢ رقم مختلف عن كلمة مرور حسابك. مدة التجهيز ٧ أيام.'),
        field(existing?'رمز الفتح الحالي':'رمز الفتح المحلي',pin),existing?null:field('تأكيد الرمز',confirmation),
        h('button',{type:'submit',class:'primary'},'تجهيز وحفظ البيانات'),button('رجوع',showLocked));
    form.addEventListener('submit',event=>{event.preventDefault();guard(async()=>{
        if(!existing && pin.value!==confirmation.value)throw new Error('رمز الفتح والتأكيد مش متطابقين.');
        await prepareShell();await vault.enroll(snapshot,pin.value);pin.value='';confirmation.value='';
        message('تم تجهيز الجهاز. تقدر تقفل التطبيق وتفتحه بالرمز المحلي لو الاتصال فاصل.');
        await showWorkspace();
    });});app.append(form);pin.focus();
}
async function showLocked(){
    clearTimeout(retryTimer);retryTimer=null;
    vault.lock();draft=null;selectedScreen=null;updateIdentity();app.replaceChildren();
    const known=await profiles();
    const card=h('section',{class:'card unlock stack'},h('h1',{},'فتح مساحة العمل المحلية'));
    if(known.length){
        const users=h('select',{'aria-label':'المستخدم المحلي'},known.map(p=>h('option',{value:p.id},p.name)));
        const pin=input('password','',()=>{},{inputmode:'numeric',autocomplete:'current-password',required:true,maxlength:12});
        const form=h('form',{class:'stack'},field('المستخدم',users),field('رمز الفتح المحلي',pin),h('button',{type:'submit',class:'primary'},'فتح'));
        form.addEventListener('submit',event=>{event.preventDefault();guard(async()=>{
            if(Date.now()<unlockAfter)throw new Error('استنى شوية قبل إعادة محاولة رمز الفتح.');
            try{await vault.unlock(users.value,pin.value);failedUnlocks=0;}
            catch(error){if(++failedUnlocks>=5)unlockAfter=Date.now()+30000;throw error;}
            pin.value='';await showWorkspace();triggerSync();
        });});card.append(form);
    }else card.append(h('p',{},'الجهاز لسه مش متجهز. سجّل دخول أونلاين مرة أولى، وبعدها فعّل وضع عدم الاتصال.'));
    card.append(button('تجهيز / تجديد المستخدم المتصل',enrollment),loginLink());app.append(card);
    message('رمز الفتح بيفتح البيانات المحلية فقط؛ الترحيل محتاج جلسة أونلاين لنفس المستخدم.');
}
function menuNodes(nodes,container){
    for(const node of nodes){
        if(node.children?.length){const detail=h('details',{},h('summary',{},node.nameAr));const body=h('div',{class:'children'});menuNodes(node.children,body);detail.append(body);container.append(detail);}
        else if(node.route && node.route.startsWith('/')){
            const available=vault.snapshot.screens.some(x=>x.route===node.route);
            container.append(h('button',{type:'button',class:available?'':'unavailable',onclick:()=>guard(async()=>{
                if(!available){message('الميزة دي محتاجة اتصال بالسيرفر. متاحة أونلاين فقط.',true);return;}
                if(draft && !confirm('فيه بيانات لسه ما اتحفظتش محليًا. تسيبها وتفتح شاشة تانية؟'))return;
                draft=null;selectedRoute=node.route;await showWorkspace();
            })},node.nameAr));
        }
    }
}
async function showWorkspace(){
    updateIdentity();app.replaceChildren();
    const snapshot=vault.snapshot;
    const expired=!canCreate(snapshot);
    message(expired?'مدة العمل دون اتصال انتهت. العمليات القديمة محفوظة وقابلة للترحيل بعد تسجيل الدخول.':'نسخة محلية — آخر تجهيز '+new Date(snapshot.issuedAt).toLocaleString('ar-EG')+' — صالحة حتى '+new Date(snapshot.expiresAt).toLocaleDateString('ar-EG'),expired);
    const aside=h('nav',{class:'card menu','aria-label':'القائمة المحلية'});
    menuNodes(snapshot.menu,aside);
    const content=h('section',{}), toolbar=h('div',{class:'toolbar'},
        button('الطابور',()=>showQueue(content)),button('ترحيل الآن',async()=>{await triggerSync(true);await showQueue(content);}),
        button('تجديد التجهيز',enrollment),loginLink());
    content.append(toolbar);
    app.append(h('div',{class:'shell'},aside,content));
    const path=new URL(location.href).searchParams.get('route')||location.pathname;
    if(!selectedRoute && snapshot.screens.some(x=>x.route===path))selectedRoute=path;
    selectedScreen=snapshot.screens.find(x=>x.route===selectedRoute);
    if(selectedScreen && !expired){renderDocument(content,selectedScreen);}
    else{
        const card=h('div',{class:'card stack'},h('h1',{},'مساحة العمل دون اتصال'),
            h('p',{},'اختار شاشة من القائمة. المتاح هنا إنشاء مستندات جديدة فقط؛ التعديل والحذف والمرتجعات وإقفال الوردية محتاجين اتصال.'));
        snapshot.screens.forEach(screen=>{const b=button(screen.name,async()=>{selectedRoute=screen.route;draft=null;await showWorkspace();});b.disabled=expired;card.append(b);});content.append(card);
        if(path!=='/' && !path.startsWith('/offline-workspace') && !snapshot.screens.some(x=>x.route===path))message('الشاشة المطلوبة محتاجة اتصال. تقدر تستخدم الشاشات المحلية المتاحة من هنا.',true);
    }
}
function renderDocument(content,screen){
    const snapshot=vault.snapshot, invoice=['sales','purchases','pos'].includes(screen.kind), purchase=screen.kind==='purchases';
    draft??={date:localDate(),storeId:snapshot.stores.find(x=>x.id===snapshot.defaults.storeId)?.id||snapshot.stores[0]?.id,
        customerId:snapshot.customers.find(x=>x.id===snapshot.defaults.defaultCustomerId)?.id||snapshot.customers[0]?.id,
        supplierId:snapshot.suppliers.find(x=>x.id===snapshot.defaults.defaultSupplierId)?.id||snapshot.suppliers[0]?.id,
        paymentAccountId:snapshot.paymentIds[0]||null,paymentAmount:0,discountValue:0,notes:'',lines:[],fromAccountId:null,toAccountId:null,amount:0};
    const card=h('form',{class:'card stack'}),heading=h('div',{class:'toolbar'},h('h1',{},screen.name),h('span',{class:'badge'},'مستند محلي جديد'));
    const fields=h('div',{class:'fields'},field('التاريخ',input('datetime-local',draft.date,v=>draft.date=v,{required:true})));card.append(heading,fields);
    const cash=snapshot.accounts.filter(x=>snapshot.paymentIds.includes(x.id));
    if(invoice){
        fields.append(field('المخزن',select(snapshot.stores,draft.storeId,v=>draft.storeId=v)),
            field(purchase?'المورد':'العميل',select(purchase?snapshot.suppliers:snapshot.customers,purchase?draft.supplierId:draft.customerId,v=>{if(purchase)draft.supplierId=v;else draft.customerId=v;})));
        const list=h('datalist',{id:'offline-items'});
        const search=input('search','',()=>{},{list:'offline-items',placeholder:'اسم الصنف أو الكود أو الباركود','aria-label':'بحث عن صنف'});
        search.addEventListener('input',()=>{
            const query=search.value.trim().toLocaleLowerCase(),suggestions=[];
            if(query.length>=2)for(const item of snapshot.items){
                if(item.name.toLocaleLowerCase().includes(query)||item.code.toLocaleLowerCase().includes(query)||item.barcodes.some(b=>b.includes(query))){
                    suggestions.push(h('option',{value:`${item.code} — ${item.name} / ${item.unit}`,label:item.unit}));
                    if(suggestions.length===30)break;
                }
            }
            list.replaceChildren(...suggestions);
        });
        const add=()=>{
            const query=search.value.trim(), item=snapshot.items.find(x=>`${x.code} — ${x.name} / ${x.unit}`===query || x.code===query || x.barcodes.includes(query));
            if(!item){message('اختار صنف من الاقتراحات أو اكتب الكود/الباركود كامل.',true);return;}
            const existing=draft.lines.find(x=>x.itemId===item.itemId && x.unitId===item.unitId);
            if(!existing && draft.lines.length>=500){message('الحد الأقصى ٥٠٠ بند للمستند المحلي.',true);return;}
            if(existing)existing.quantity++;else draft.lines.push({itemId:item.itemId,unitId:item.unitId,name:item.name,unit:item.unit,quantity:1,unitPrice:purchase?item.purchasePrice:item.salePrice,discountPercent:0,taxPercent:0});
            search.value='';renderLines();search.focus();
        };
        search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add();}});
        card.append(h('div',{class:'search'},search,button('إضافة صنف',add)),list);
        const body=h('tbody'), total=h('strong',{class:'total'}), paid=input('number',draft.paymentAmount,v=>draft.paymentAmount=v,{min:0,step:'0.01'});
        function calculate(){const sum=Math.round((draft.lines.reduce((s,l)=>s+l.quantity*l.unitPrice*(1-l.discountPercent/100)*(1+l.taxPercent/100),0)-draft.discountValue+Number.EPSILON)*100)/100;total.textContent=money(sum);if(!snapshot.canCredit){draft.paymentAmount=sum;paid.value=sum.toFixed(2);}return sum;}
        function renderLines(){
            body.replaceChildren();draft.lines.forEach((line,i)=>{
                const editable=purchase||snapshot.canEditPrice;
                const qty=input('number',line.quantity,v=>{line.quantity=v;renderLines();},{min:'0.01',step:'any','aria-label':'الكمية'});
                const price=input('number',line.unitPrice,v=>{line.unitPrice=v;renderLines();},{min:0,step:'any','aria-label':'سعر الوحدة'});price.readOnly=!editable;
                const gross=input('number',(line.quantity*line.unitPrice).toFixed(2),v=>{if(line.quantity>0){line.unitPrice=v/line.quantity;renderLines();}},{min:0,step:'0.01','aria-label':'القيمة'});gross.readOnly=!editable;
                const tax=input('number',line.taxPercent,v=>{line.taxPercent=v;calculate();},{min:0,max:100,step:'any','aria-label':'الضريبة %'});
                body.append(h('tr',{},h('td',{},line.name),h('td',{},line.unit),h('td',{},qty),h('td',{},price),h('td',{},gross),h('td',{},tax),h('td',{},button('حذف',()=>{draft.lines.splice(i,1);renderLines();}))));
            });calculate();
        }
        card.append(h('div',{class:'grid-scroll'},h('table',{class:'lines'},h('thead',{},h('tr',{},['الصنف','الوحدة','الكمية','السعر','القيمة','ضريبة %',''].map(t=>h('th',{},t)))),body)));
        paid.readOnly=!snapshot.canCredit;
        card.append(h('div',{class:'fields'},field('حساب السداد',select(cash,draft.paymentAccountId,v=>draft.paymentAccountId=v)),field('المدفوع',paid),
            field('خصم الفاتورة',input('number',draft.discountValue,v=>{draft.discountValue=v;calculate();},{min:0,step:'0.01'})),field('الصافي',total)));
        renderLines();
        if(screen.kind==='pos' && !snapshot.shift)card.append(h('p',{class:'muted'},'مفيش وردية محفوظة وقت التجهيز. افتح الوردية أونلاين وجدّد التجهيز قبل استخدام نقطة البيع.'));
    }else{
        const prefixes={customer:['112'],supplier:['211'],expense:['51','52','53'],revenue:['41','42'],partner:['221'],creditor:['212'],debtor:['114'],employee:['213']}[screen.party];
        const other=snapshot.accounts.filter(x=>prefixes.some(p=>x.code.startsWith(p)));
        fields.append(field('من حساب',select(screen.kind==='receipt'?other:cash,draft.fromAccountId,v=>draft.fromAccountId=v)),
            field('إلى حساب',select(screen.kind==='receipt'?cash:other,draft.toAccountId,v=>draft.toAccountId=v)),
            field('المبلغ',input('number',draft.amount,v=>draft.amount=v,{min:'0.01',step:'0.01',required:true})));
    }
    const notes=h('textarea',{rows:2,maxlength:800});notes.value=draft.notes;notes.addEventListener('change',()=>draft.notes=notes.value);card.append(field('البيان / ملاحظات',notes));
    card.append(h('div',{class:'actions'},h('button',{type:'submit',class:'primary'},'حفظ في الطابور المحلي'),button('عرض الطابور',()=>showQueue(content))));
    card.addEventListener('keydown',e=>{
        if(e.key==='Enter' && e.target.tagName!=='TEXTAREA')e.preventDefault();
        if(e.key==='+' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && e.target.tagName!=='TEXTAREA'){
            e.preventDefault();document.activeElement?.blur();card.requestSubmit();
        }
    });
    card.addEventListener('submit',e=>{e.preventDefault();guard(async()=>{
        // Read the latest change from the focused editor before serializing.
        document.activeElement?.blur();
        if(!canCreate(snapshot))throw new Error('مدة التجهيز انتهت. جدّدها أونلاين.');
        let payload;
        if(invoice){
            if(!draft.lines.length || !draft.storeId || !(purchase?draft.supplierId:draft.customerId))throw new Error('اختار المخزن والعميل/المورد، وأضف الأصناف.');
            if(draft.lines.some(l=>!Number.isFinite(l.quantity)||l.quantity<=0||!Number.isFinite(l.unitPrice)||l.unitPrice<0))throw new Error('راجع الكميات والأسعار.');
            if(screen.kind==='pos'&&!snapshot.shift)throw new Error('افتح وردية أونلاين أولًا وجدّد التجهيز.');
            const sum=Math.round((draft.lines.reduce((s,l)=>s+l.quantity*l.unitPrice*(1-l.discountPercent/100)*(1+l.taxPercent/100),0)-draft.discountValue+Number.EPSILON)*100)/100;
            if(sum<0||draft.paymentAmount<0||draft.paymentAmount>sum+.001||(!snapshot.canCredit&&Math.abs(draft.paymentAmount-sum)>.001))throw new Error('راجع الخصم والمدفوع وصلاحية البيع على الحساب.');
            if(draft.paymentAmount>0&&!draft.paymentAccountId)throw new Error('اختار حساب السداد.');
            payload={operationId:0,date:draft.date,storeId:draft.storeId,customerId:purchase?null:draft.customerId,supplierId:purchase?draft.supplierId:null,
                paymentAmount:draft.paymentAmount,paymentAccountId:draft.paymentAccountId,discountValue:draft.discountValue,notes:draft.notes,
                lines:draft.lines.map(({itemId,unitId,quantity,unitPrice,discountPercent,taxPercent})=>({itemId,unitId,quantity,unitPrice,discountPercent,taxPercent}))};
        }else{
            if(!draft.fromAccountId||!draft.toAccountId||draft.fromAccountId===draft.toAccountId||draft.amount<=0)throw new Error('اختار الحسابين وراجع قيمة السند.');
            payload={id:0,operationDate:draft.date,fromAccountId:draft.fromAccountId,toAccountId:draft.toAccountId,amount:draft.amount,notes:draft.notes};
        }
        const saved=await vault.enqueue(screen.route,payload);draft=null;
        await showQueue(content);message(`تم الحفظ محليًا برقم ${saved.id.slice(0,8)}. لسه مش مرحّل للسيرفر.`);triggerSync();
    });});content.append(card);
}
async function showQueue(content){
    const rows=await vault.queue();content.querySelectorAll('.card').forEach(x=>x.remove());
    const card=h('div',{class:'card'},h('h1',{},'طابور '+vault.profile.name));
    if(!rows.length)card.append(h('p',{},'مفيش عمليات محفوظة محليًا.'));
    const names={pending:'بانتظار الترحيل',synced:'تم الترحيل',review:'محتاجة مراجعة'};
    for(const row of rows){
        const screen=vault.snapshot.screens.find(x=>x.route===row.route);
        const entry=h('div',{class:'queue-item'},h('strong',{},screen?.name||row.route),
            h('span',{},`${new Date(row.createdAt).toLocaleString('ar-EG')} — ${names[row.state]}${row.serverId?' — رقم السيرفر '+row.serverId:''}`),
            h('small',{class:'muted'},'الرقم المحلي: '+row.id));
        if(row.error)entry.append(h('p',{},row.error));
        entry.append(button('عرض التفاصيل',()=>{
            const details=h('pre',{class:'muted'});details.style.whiteSpace='pre-wrap';
            details.textContent=JSON.stringify(row.payload,null,2);entry.append(details);
        }));
        if(row.state==='review')entry.append(button('إعادة التحقق والترحيل بنفس الرقم',async()=>{
            row.state='pending';row.error=null;await vault.updateOperation(row);await triggerSync(true);await showQueue(content);
        }));
        card.append(entry);
    }
    content.append(card);
}
async function triggerSync(explicit=false){
    if(syncBusy||!vault.profile)return;syncBusy=true;
    let requiresLogin=false;
    clearTimeout(retryTimer);retryTimer=null;
    try{const count=await vault.sync();if(count)message(`تم ترحيل ${count} عملية بنجاح. باقي الحالات موجودة في الطابور.`);else if(explicit)message('التحقق اكتمل. راجع حالات العمليات في الطابور.');}
    catch(error){requiresLogin=error.requiresLogin===true;if(explicit||requiresLogin)message(error.message||'الاتصال مش متاح. العمليات لسه محفوظة.',true);}
    finally{
        syncBusy=false;
        if(vault.profile && !requiresLogin && document.visibilityState==='visible'){
            const pending=(await vault.queue()).some(x=>x.state==='pending');
            if(pending){retryTimer=setTimeout(()=>triggerSync(),retryDelay);retryDelay=Math.min(300000,retryDelay*2);}
            else retryDelay=30000;
        }
    }
}
document.querySelector('#lock').addEventListener('click',()=>guard(showLocked));
window.addEventListener('online',()=>triggerSync());
// An existing network connection can outlive a server outage. Recheck only on
// foregrounding the app or explicit request, never a recurring server poll.
document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')triggerSync();
    else {clearTimeout(retryTimer);retryTimer=null;}
});
window.addEventListener('pagehide',()=>{vault.lock();app.replaceChildren();updateIdentity();});
window.addEventListener('pageshow',event=>{if(event.persisted)guard(showLocked);});
await guard(showLocked);
