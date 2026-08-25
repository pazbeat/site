// ═══════════════════════════════════════════════════════════════════════
//  Узел «check» на вкладке Kaspi (red.imbir.kz)
//  Полная замена содержимого. Изменён ТОЛЬКО блок catch в самом низу —
//  всё остальное оставлено дословно как было.
//
//  Что добавлено: не найдя заказ у себя, спрашиваем новый сайт new.imbir.kz.
//  Любая неудача (нет сети, таймаут, неверный ответ) = поведение ровно
//  такое же, как до правки. Сломать приём денег на действующем сайте эта
//  вставка не может.
// ═══════════════════════════════════════════════════════════════════════

// kaspi data1 = machid
let id = msg.payload.account;
let payload = {}
const $ = flow.get('$');

// ── мост на новый сайт ────────────────────────────────────────────────
const BRIDGE_URL = 'https://new.imbir.kz/api/kaspi/order/';
const BRIDGE_TOKEN = 'ВСТАВИТЬ_СЕКРЕТ';   // выдаётся отдельно, не хранить в гите
const BRIDGE_TIMEOUT_MS = 3000;           // Kaspi ждёт ответа недолго

async function askNewSite(orderId) {
    try {
        const res = await fetch(BRIDGE_URL + encodeURIComponent(orderId), {
            headers: { 'X-Bridge-Token': BRIDGE_TOKEN },
            signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS)
        });
        if (!res.ok) return null;
        const data = await res.json();
        return (data && data.found) ? data : null;
    } catch (err) {
        // мост недоступен — ведём себя так, будто его нет
        node.warn('kaspi bridge: ' + err.message);
        return null;
    }
}
// ──────────────────────────────────────────────────────────────────────

return (async () => {

if(id=='001AA01'||id=='001AA02'){
    payload = {
        "sum": 10,
        "fields": {
            "field1": {
                "@name": "Услуга",
                "#text": "Тай массажы(Тест)|Тайский Массаж (Тест)"
            }
        }
    }
} else if (id == '002AA01'){
    payload = {
        "sum": 0,
        result: 3, //Уже использован
        "fields": {
            "field1": {
                "@name": "Услуга",
                "#text": "Сертификат бұрыннан қолданылған|Сертификат уже использован"
            }
        }
    }
}
else if (id == 'NOTFOUND' || id == '003AA01'){
    payload = {
        "sum": 0,
        result: 2,
        comment: `Сертификат ${id} не найден`,
        "fields": {
            "field1": {
                "@name": "Услуга",
                "#text": `${id} сертификаты табылмады|Сертификат ${id} не найден`
            }
        }
    }
} else if (id == 'UNAVAIL' || id == '004AA01'){
    payload = {
        "sum": 0,
        result: 1, // Билинг недоступен
        comment: `Сервис недоступен`,
        "fields": {
            "field1": {
                "@name": "Услуга",
                "#text": `Сервис қызмет көрсете алмайды|Сервис недоступен`
            }
        }
    }
} else  {
    try {
        const order = $.getOrder(id);
        payload = {
            result: 0,
            sum: order.price,
            "fields": {
                "field1": {
                    "@name": "Услуга",
                    "#text": `${order.name}|${order.name}`
                }
            }
        };
    } catch(e){

        // ── НАЧАЛО ВСТАВКИ ────────────────────────────────────────────
        // Заказа нет у нас — возможно, он с нового сайта. Спрашиваем его.
        // Только при 'not_found': если своя база просто недоступна, мост
        // не поможет и ответ должен остаться прежним.
        let bridged = null;
        if (e.code == 'not_found') {
            bridged = await askNewSite(id);
        }

        if (bridged && bridged.status === 'paid') {
            // Уже оплачен — тот же ответ, что и для использованного
            payload = {
                sum: 0,
                result: 3,
                "fields": {
                    "field1": {
                        "@name": "Услуга",
                        "#text": "Сертификат бұрыннан қолданылған|Сертификат уже оплачен"
                    }
                }
            };
        } else if (bridged) {
            payload = {
                result: 0,
                sum: bridged.amountKzt,
                "fields": {
                    "field1": {
                        "@name": "Услуга",
                        "#text": `${bridged.name}|${bridged.name}`
                    }
                }
            };
        } else {
        // ── КОНЕЦ ВСТАВКИ; ниже — прежний код без изменений ───────────

            payload = {
                ...msg.payload,
                result: e.code=='not_found'?2:1,
                comment: e.message
            }

        }   // ← закрывающая скобка добавленного else
    }
}

msg.payload = {result:0, ...msg.payload, ...payload}

// 001AA01 - 10тг ( сертификат на сумму 10тг )
// 002AA01 - 0тг ( сертификат использован )
// 003AA01 - 0тг ( сертификат ненайден )
// 004AA01 - 0тг ( система недоступна )

return msg;

})();
