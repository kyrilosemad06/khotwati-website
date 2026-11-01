import { route, send, readJson, requireOwner } from '../_lib/http.js';
import { approveOrder } from '../_lib/orders.js';
export default route(['POST'], async (req, res) => {
  await requireOwner(req);
  const b = await readJson(req);
  const o = await approveOrder(b.id, b.code);
  send(res, 200, { id: o.id, status: o.status, licenseId: o.licenseId, lastDay: o.lastDay });
});
