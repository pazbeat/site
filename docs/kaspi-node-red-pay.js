// kaspi data1 = machid
let id = msg.payload.account;
let payload = {};
const $ = flow.get('$')

const BRIDGE_HOST = 'new.imbir.kz';
const BRIDGE_PATH = '/api/kaspi/order/';
const BRIDGE_TOKEN = 'ВСТАВИТЬ_СЕКРЕТ';
const BRIDGE_TIMEOUT_MS = 5000;

// Номера нового сайта: двадцать цифр, первая — девятка.
// Номера этого сайта начинаются с единицы, пересечься не могут.
const IS_NEW_SITE_ORDER = /^9[0-9]{19}$/;

function tellNewSite(orderId) {
    const body = JSON.stringify({
        amountKzt: Math.round(Number(msg.payload.sum)),
        txnId: msg.payload.txn_id
    });
    return new Promise(function (resolve) {
        let req;
        try {
            req = https.request({
                hostname: BRIDGE_HOST,
                path: BRIDGE_PATH + encodeURIComponent(orderId) + '/paid',
                method: 'POST',
                headers: {
                    'X-Bridge-Token': BRIDGE_TOKEN,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                },
                timeout: BRIDGE_TIMEOUT_MS
            }, function (res) {
                res.resume();
                res.on('end', function () {
                    if (res.statusCode === 404) return resolve('not_found');
                    if (res.statusCode >= 200 && res.statusCode < 300) return resolve('ok');
                    node.warn('kaspi bridge pay: HTTP ' + res.statusCode + ' по заказу ' + orderId);
                    resolve('error');
                });
            });
        } catch (err) {
            node.warn('kaspi bridge pay: ' + err.message);
            return resolve('error');
        }
        req.on('timeout', function () { req.destroy(new Error('таймаут')); });
        req.on('error', function (err) {
            node.warn('kaspi bridge pay: ' + err.message + ' по заказу ' + orderId);
            resolve('error');
        });
        req.write(body);
        req.end();
    });
}

if (id == '001AA01' || id == '001AA02') {
    payload = msg.payload
} else if (id == '002AA01') {
    payload = msg.payload
} else if (id == '003AA01') {
    payload = {
        result: 1, // Клиент не найден
        comment: `Клиент ${id} не найден`
    }
} else {
    try {
        $.setOrder(id, (order) => {
            return {
                paid: order.price + ".00" == msg.payload.sum,
                kaspi: msg.payload
            }
        });
        payload = {
            ...msg.payload,
            result: 0,
        };
    } catch (e) {
        node.warn('kaspi pay: свой заказ не найден, code=' + e.code + ', id=' + id);
        let bridged = null;
        if (IS_NEW_SITE_ORDER.test(String(id))) {
            bridged = await tellNewSite(id);
        }

        if (bridged === 'ok') {
            payload = {
                ...msg.payload,
                result: 0,
            };
        } else if (bridged === 'error') {
            payload = {
                ...msg.payload,
                result: 1,
                comment: 'Не удалось подтвердить оплату, повторите'
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

return msg;
