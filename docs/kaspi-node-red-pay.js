// kaspi data1 = machid
let id = msg.payload.account;
let payload = {};
const $ = flow.get('$')

const BRIDGE_URL = 'https://new.imbir.kz/api/kaspi/order/';
const BRIDGE_TOKEN = 'ВСТАВИТЬ_СЕКРЕТ';
const BRIDGE_TIMEOUT_MS = 5000;

// Номера нового сайта: двадцать цифр, первая — девятка.
// Номера этого сайта начинаются с единицы, пересечься не могут.
const IS_NEW_SITE_ORDER = /^9[0-9]{19}$/;

// Таймаут без AbortController: в песочнице Node-RED его нет.
// Запрос не прерываем, просто перестаём ждать — для нашей задачи достаточно.
function withTimeout(promise, ms) {
    let timer;
    const guard = new Promise(function (_resolve, reject) {
        timer = setTimeout(function () { reject(new Error('таймаут ' + ms + ' мс')); }, ms);
    });
    return Promise.race([promise, guard]).finally(function () { clearTimeout(timer); });
}

// fetch берём только через globalThis: голое имя редактор Node-RED считает
// необъявленной переменной и помечает узел негодным при развёртывании.
function getFetch() {
    if (typeof globalThis === 'undefined') return null;
    if (typeof globalThis.fetch !== 'function') return null;
    return globalThis.fetch;
}

async function tellNewSite(orderId) {
    const doFetch = getFetch();
    if (!doFetch) {
        node.warn('kaspi bridge pay: fetch в этой версии Node-RED недоступен');
        return 'error';
    }
    try {
        const res = await withTimeout(
            doFetch(BRIDGE_URL + encodeURIComponent(orderId) + '/paid', {
                method: 'POST',
                headers: {
                    'X-Bridge-Token': BRIDGE_TOKEN,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amountKzt: Math.round(Number(msg.payload.sum)),
                    txnId: msg.payload.txn_id
                })
            }),
            BRIDGE_TIMEOUT_MS
        );
        if (res.status === 404) return 'not_found';
        if (res.ok) return 'ok';
        node.warn('kaspi bridge pay: HTTP ' + res.status + ' по заказу ' + orderId);
        return 'error';
    } catch (err) {
        node.warn('kaspi bridge pay: ' + err.message + ' по заказу ' + orderId);
        return 'error';
    }
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
