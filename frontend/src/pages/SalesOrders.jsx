import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

function OrderCard({ order, isAdmin, isSales, onConfirm, onCancel, onDispatch }) {
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(order.items.map((it) => [it.id, it.quantity - it.dispatchedQty]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reset the dispatch quantities to the fresh remaining amounts whenever this
  // order's data is reloaded (e.g. after a dispatch), so a stale leftover
  // value can never be resubmitted as if it were still valid.
  useEffect(() => {
    setQuantities(Object.fromEntries(order.items.map((it) => [it.id, it.quantity - it.dispatchedQty])));
  }, [order]);

  const remainingItems = order.items.filter((it) => it.quantity - it.dispatchedQty > 0);
  const customerName = order.quotation.enquiry.customer.companyName;

  async function handleConfirm() {
    setError('');
    setBusy(true);
    try {
      await onConfirm(order.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to confirm order');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setError('');
    setBusy(true);
    try {
      await onCancel(order.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel order');
    } finally {
      setBusy(false);
    }
  }

  async function handleDispatch(e) {
    e.preventDefault();
    setError('');
    const items = remainingItems
      .map((it) => ({ productId: it.productId, quantity: Number(quantities[it.id]) }))
      .filter((it) => it.quantity > 0);
    if (items.length === 0) {
      setError('Enter a quantity to dispatch for at least one product');
      return;
    }
    setBusy(true);
    try {
      await onDispatch(order.id, { vehicleNumber, driverName, items });
      setVehicleNumber('');
      setDriverName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to dispatch');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="order-card">
      <div className="order-header">
        <strong>{order.orderNumber}</strong>
        <span>{customerName}</span>
        <span>Quotation {order.quotation.quotationNumber}</span>
        <span>{order.orderDate?.slice(0, 10)}</span>
        <span>Total {order.totalAmount}</span>
        <span className={`badge badge-${order.status.toLowerCase()}`}>{order.status}</span>
      </div>

      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Ordered</th>
            <th>Dispatched</th>
            <th>Remaining</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => (
            <tr key={it.id}>
              <td>
                {it.product.code} - {it.product.name}
              </td>
              <td>{it.quantity}</td>
              <td>{it.dispatchedQty}</td>
              <td>{it.quantity - it.dispatchedQty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {isAdmin && order.status === 'PENDING' && (
        <button onClick={handleConfirm} disabled={busy}>
          Confirm Order
        </button>
      )}

      {isSales && order.status === 'PENDING' && (
        <button className="secondary" onClick={handleCancel} disabled={busy}>
          Cancel Order
        </button>
      )}

      {isAdmin && order.status === 'CONFIRMED' && (
        <form className="dispatch-form" onSubmit={handleDispatch}>
          <h4>Dispatch</h4>
          <div className="dispatch-fields">
            <label>
              Vehicle Number
              <input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} required />
            </label>
            <label>
              Driver Name
              <input value={driverName} onChange={(e) => setDriverName(e.target.value)} required />
            </label>
          </div>
          {remainingItems.map((it) => (
            <label key={it.id} className="dispatch-qty-row">
              {it.product.code} (remaining {it.quantity - it.dispatchedQty})
              <input
                type="number"
                min="0"
                max={it.quantity - it.dispatchedQty}
                value={quantities[it.id]}
                onChange={(e) => setQuantities({ ...quantities, [it.id]: e.target.value })}
              />
            </label>
          ))}
          <button type="submit" disabled={busy}>
            Dispatch
          </button>
        </form>
      )}
    </div>
  );
}

export default function SalesOrders() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const isSales = user.role === 'SALES';

  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadError, setLoadError] = useState('');

  async function loadAll() {
    try {
      const [ordersRes, productsRes] = await Promise.all([api.get('/sales-orders'), api.get('/products')]);
      setOrders(ordersRes.data);
      setProducts(productsRes.data);
    } catch {
      setLoadError('Failed to load data');
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleConfirm(orderId) {
    await api.post(`/sales-orders/${orderId}/confirm`);
    await loadAll();
  }

  async function handleCancel(orderId) {
    await api.post(`/sales-orders/${orderId}/cancel`);
    await loadAll();
  }

  async function handleDispatch(orderId, payload) {
    await api.post(`/sales-orders/${orderId}/dispatch`, payload);
    await loadAll();
  }

  return (
    <div className="page">
      <h2>Sales Orders</h2>
      {loadError && <p className="error">{loadError}</p>}

      <h3>Inventory Availability</h3>
      <table className="table inventory-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Physical</th>
            <th>Reserved</th>
            <th>Available</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>
                {p.code} - {p.name}
              </td>
              <td>{p.physicalQty}</td>
              <td>{p.reservedQty}</td>
              <td>{p.available}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Orders</h3>
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          isAdmin={isAdmin}
          isSales={isSales}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onDispatch={handleDispatch}
        />
      ))}
    </div>
  );
}
