import { cmd } from './_lib/redis.js';
import { route, send, readJson, query, clientIp, rateLimit, HttpError } from './_lib/http.js';
import { createOrder, load, publicView, validId, notifyOwner } from './_lib/orders.js';

const KIND = { new: 'اشتراك جديد', renew: 'تجديد', transfer: 'نقل لجهاز جديد' };
const PAY = { instapay: 'إنستا باي', vodafone: 'فودافون كاش', orange: 'أورنج كاش' };

/** POST /api/orders  -> create an order      GET /api/orders?id=KH-XXXXXXXX -> status (+ code once approved) */
export default route(['GET', 'POST'], async (req, res) => {
  const ip = clientIp(req);
  if (req.method === 'POST') {
    if (!(await rateLimit(`rl:create:${ip}`, 8, 3600))) throw new HttpError(429, 'too_many_orders');
    const b = await readJson(req);
    const { order, existing } = await createOrder(b);
    if (!existing) await notifyOwner(`🛒 طلب جديد ${order.id}\n${KIND[order.type]} · ${PAY[order.method]}${order.amount ? ' · ' + order.amount : ''}\n${order.name || '-'} ${order.contact || ''}\nراجع التحويل ثم أكّد من /owner`);
    return send(res, existing ? 200 : 201, { ...publicView(order), existing });
  }
  if (!(await rateLimit(`rl:status:${ip}`, 1200, 3600))) throw new HttpError(429, 'too_many_requests');
  const id = String(query(req).id || '').toUpperCase();
  if (!validId(id)) throw new HttpError(400, 'bad_id');
  const o = await load(id);
  if (!o) throw new HttpError(404, 'not_found');
  send(res, 200, publicView(o));
});
