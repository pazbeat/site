// kaspi data1 = machid
let id = msg.payload.account;
let payload = {};
const $ = flow.get('$')

const BRIDGE_URL = 'https://new.imbir.kz/api/kaspi/order/';
const BRIDGE_TOKEN = 'ВСТАВИТЬ_СЕКРЕТ';
const BRIDGE_TIMEOUT_MS = 5000;

async function tellNewSite(orderId) {
    try {
        const controller = new globalThis.AbortController();
        const timer = setTimeout(function () { controller.abort(); }, BRIDGE_TIMEOUT_MS);
        let res;
        try {
            res = await globalThis.fetch(BRIDGE_URL + encodeURIComponent(orderId) + '/paid', {
                method: 'POST',
                headers: {
                    'X-Bridge-Token': BRIDGE_TOKEN,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amountKzt: Math.round(Number(msg.payload.sum)),
                    txnId: msg.payload.txn_id
                }),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timer);
        }
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
        let bridged = null;
        if (e.code == 'not_found') {
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
