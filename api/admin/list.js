import { route, send, query, requireOwner } from '../_lib/http.js';
import { listOrders } from '../_lib/orders.js';
export default route(['GET'], async (req, res) => {
  await requireOwner(req);
  const status = query(req).status === 'approved' ? 'approved' : 'pending';
  send(res, 200, { orders: await listOrders(status) });
});
