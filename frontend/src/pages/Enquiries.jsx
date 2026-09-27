import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const emptyNewCustomer = { companyName: '', contactPerson: '', mobile: '', email: '', city: '' };

export default function Enquiries() {
  const { user } = useAuth();

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [loadError, setLoadError] = useState('');

  const [customerId, setCustomerId] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState(emptyNewCustomer);
  const [requiredDate, setRequiredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ productId: '', quantity: 1 }]);

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadAll() {
    try {
      const [customersRes, productsRes, enquiriesRes] = await Promise.all([
        api.get('/customers'),
        api.get('/products'),
        api.get('/enquiries'),
      ]);
      setCustomers(customersRes.data);
      setProducts(productsRes.data);
      setEnquiries(enquiriesRes.data);
    } catch {
      setLoadError('Failed to load data');
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function addItemRow() {
    setItems([...items, { productId: '', quantity: 1 }]);
  }

  function removeItemRow(index) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index, field, value) {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function resetForm() {
    setCustomerId('');
    setAddingCustomer(false);
    setNewCustomer(emptyNewCustomer);
    setRequiredDate('');
    setNotes('');
    setItems([{ productId: '', quantity: 1 }]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    const parsedItems = items.map((item) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
    }));

    if (parsedItems.some((item) => !item.productId || item.quantity <= 0)) {
      setFormError('Every product line needs a product and a quantity greater than 0');
      return;
    }
    const productIds = parsedItems.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      setFormError('The same product cannot appear twice in one enquiry');
      return;
    }

    setSubmitting(true);
    try {
      let finalCustomerId = customerId;

      if (addingCustomer) {
        const customerRes = await api.post('/customers', newCustomer);
        finalCustomerId = customerRes.data.id;
      }

      if (!finalCustomerId) {
        setFormError('Please choose or add a customer');
        setSubmitting(false);
        return;
      }

      await api.post('/enquiries', {
        customerId: Number(finalCustomerId),
        requiredDate: requiredDate || undefined,
        notes: notes || undefined,
        items: parsedItems,
      });

      resetForm();
      await loadAll();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create enquiry');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkLost(enquiryId) {
    try {
      await api.patch(`/enquiries/${enquiryId}/status`, { status: 'LOST' });
      await loadAll();
    } catch (err) {
      setLoadError(err.response?.data?.error || 'Failed to update enquiry');
    }
  }

  const isSales = user.role === 'SALES';

  return (
    <div className="page">
      <h2>Enquiries</h2>
      {loadError && <p className="error">{loadError}</p>}

      {isSales && (
        <form className="panel" onSubmit={handleSubmit}>
          <h3>New Enquiry</h3>
          {formError && <p className="error">{formError}</p>}

          <label>
            Customer
            <select
              value={addingCustomer ? 'new' : customerId}
              onChange={(e) => {
                if (e.target.value === 'new') {
                  setAddingCustomer(true);
                  setCustomerId('');
                } else {
                  setAddingCustomer(false);
                  setCustomerId(e.target.value);
                }
              }}
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
              <option value="new">+ New customer</option>
            </select>
          </label>

          {addingCustomer && (
            <div className="sub-panel">
              <label>
                Company Name
                <input
                  value={newCustomer.companyName}
                  onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
                  required
                />
              </label>
              <label>
                Contact Person
                <input
                  value={newCustomer.contactPerson}
                  onChange={(e) => setNewCustomer({ ...newCustomer, contactPerson: e.target.value })}
                  required
                />
              </label>
              <label>
                Mobile
                <input
                  value={newCustomer.mobile}
                  onChange={(e) => setNewCustomer({ ...newCustomer, mobile: e.target.value })}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  required
                />
              </label>
              <label>
                City
                <input
                  value={newCustomer.city}
                  onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                  required
                />
              </label>
            </div>
          )}

          <label>
            Required Date
            <input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
          </label>

          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>

          <h4>Products</h4>
          {items.map((item, index) => (
            <div className="item-row" key={index}>
              <select
                value={item.productId}
                onChange={(e) => updateItem(index, 'productId', e.target.value)}
                required
              >
                <option value="">Select a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                required
              />
              <button type="button" className="secondary" onClick={() => removeItemRow(index)}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="secondary" onClick={addItemRow}>
            + Add product
          </button>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Enquiry'}
          </button>
        </form>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Enquiry No.</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Required</th>
            <th>Products</th>
            <th>Status</th>
            {isSales && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {enquiries.map((enq) => (
            <tr key={enq.id}>
              <td>{enq.enquiryNumber}</td>
              <td>{enq.customer.companyName}</td>
              <td>{enq.enquiryDate?.slice(0, 10)}</td>
              <td>{enq.requiredDate ? enq.requiredDate.slice(0, 10) : '-'}</td>
              <td>
                {enq.items.map((it) => `${it.product.code} x${it.quantity}`).join(', ')}
              </td>
              <td>
                <span className={`badge badge-${enq.status.toLowerCase()}`}>{enq.status}</span>
              </td>
              {isSales && (
                <td>
                  {enq.status === 'QUOTED' && (
                    <button className="secondary" onClick={() => handleMarkLost(enq.id)}>
                      Mark as Lost
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
