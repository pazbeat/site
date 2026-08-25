// kaspi data1 = machid
let id = msg.payload.account;
let payload = {}
const $ = flow.get('$');

const BRIDGE_HOST = 'new.imbir.kz';
const BRIDGE_PATH = '/api/kaspi/order/';
const BRIDGE_TOKEN = 'ВСТАВИТЬ_СЕКРЕТ';
const BRIDGE_TIMEOUT_MS = 3000;

// Номера нового сайта: двадцать цифр, первая — девятка.
// Номера этого сайта начинаются с единицы, пересечься не могут.
const IS_NEW_SITE_ORDER = /^9[0-9]{19}$/;

function askNewSite(orderId) {
    return new Promise(function (resolve) {
        let req;
        try {
            req = https.request({
                hostname: BRIDGE_HOST,
                path: BRIDGE_PATH + encodeURIComponent(orderId),
                method: 'GET',
                headers: { 'X-Bridge-Token': BRIDGE_TOKEN },
                timeout: BRIDGE_TIMEOUT_MS
            }, function (res) {
                let body = '';
                res.setEncoding('utf8');
                res.on('data', function (chunk) { body += chunk; });
                res.on('end', function () {
                    if (res.statusCode !== 200) {
                        node.warn('kaspi bridge: HTTP ' + res.statusCode);
                        return resolve(null);
                    }
                    try {
                        const data = JSON.parse(body);
                        if (data && data.found) return resolve(data);
                        node.warn('kaspi bridge: заказ не найден и на новом сайте');
                        resolve(null);
                    } catch (err) {
                        node.warn('kaspi bridge: ответ не разобран');
                        resolve(null);
                    }
                });
            });
        } catch (err) {
            node.warn('kaspi bridge: ' + err.message);
            return resolve(null);
        }
        req.on('timeout', function () { req.destroy(new Error('таймаут')); });
        req.on('error', function (err) {
            node.warn('kaspi bridge: ' + err.message);
            resolve(null);
        });
        req.end();
    });
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
        node.warn('kaspi: свой заказ не найден, code=' + e.code + ', id=' + id);
        let bridged = null;
        if (IS_NEW_SITE_ORDER.test(String(id))) {
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
