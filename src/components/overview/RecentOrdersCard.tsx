import { Link } from 'react-router-dom';
import Card from '../ui/card';
import OrderStatusBadge from '../orders/OrderStatusBadge';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';

export default function RecentOrdersCard({ orders }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Order Terbaru</h3>
          <p className="text-xs text-slate-400">5 order dengan tanggal paling baru</p>
        </div>
        <Link to="/orders" className="text-xs font-semibold text-primary hover:text-primary/80">
          Lihat semua →
        </Link>
      </div>

      {orders.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Belum ada order.</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {orders.map((order) => (
            <li key={order.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{order.order_id}</p>
                <p className="text-xs text-slate-400">
                  {order.customer_name} · {formatDateID(order.order_date)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums text-slate-900">{formatIDR(order.grand_total)}</p>
                <div className="mt-0.5">
                  <OrderStatusBadge status={order.status} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
