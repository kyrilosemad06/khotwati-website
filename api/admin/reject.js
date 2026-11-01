import { route, send, readJson, requireOwner } from '../_lib/http.js';
import { rejectOrder } from '../_lib/orders.js';
export default route(['POST'], async (req, res) => {
  await requireOwner(req);
  const b = await readJson(req);
  const o = await rejectOrder(b.id, b.reason);
  send(res, 200, { id: o.id, status: o.status });
});
