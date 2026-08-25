// kaspi data1 = machid
let id = msg.payload.account;
let payload = {}
const $ = flow.get('$');

const BRIDGE_URL = 'https://new.imbir.kz/api/kaspi/order/';
const BRIDGE_TOKEN = 'ВСТАВИТЬ_СЕКРЕТ';
const BRIDGE_TIMEOUT_MS = 3000;

async function askNewSite(orderId) {
    try {
        const controller = new globalThis.AbortController();
        const timer = setTimeout(function () { controller.abort(); }, BRIDGE_TIMEOUT_MS);
        let res;
        try {
            res = await globalThis.fetch(BRIDGE_URL + encodeURIComponent(orderId), {
                headers: { 'X-Bridge-Token': BRIDGE_TOKEN },
                signal: controller.signal
            });
        } finally {
            clearTimeout(timer);
        }
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.found) return data;
        return null;
    } catch (err) {
        node.warn('kaspi bridge: ' + err.message);
        return null;
    }
}

if (id == '001AA01' || id == '001AA02') {
    payload = {
        "sum": 10,
        "fields": {
            "field1": {
                "@name": "Услуга",
                "#text": "Тай массажы(Тест)|Тайский Массаж (Тест)"
            }
        }
    }
} else if (id == '002AA01') {
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
} else if (id == 'NOTFOUND' || id == '003AA01') {
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
} else if (id == 'UNAVAIL' || id == '004AA01') {
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
} else {
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
    } catch (e) {
        let bridged = null;
        if (e.code == 'not_found') {
            bridged = await askNewSite(id);
        }

        if (bridged && bridged.status === 'paid') {
            payload = {
                "sum": 0,
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
            payload = {
                ...msg.payload,
                result: e.code == 'not_found' ? 2 : 1,
                comment: e.message
            }
        }
    }
}

msg.payload = { result: 0, ...msg.payload, ...payload }

// 001AA01 - 10тг ( сертификат на сумму 10тг )
// 002AA01 - 0тг ( сертификат использован )
// 003AA01 - 0тг ( сертификат ненайден )
// 004AA01 - 0тг ( система недоступна )

return msg;
