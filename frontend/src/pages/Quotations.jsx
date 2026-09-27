import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const emptyItem = { productId: '', quantity: 1, unitPrice: '', discountPct: 0, gstPct: 18 };

export default function Quotations() {
  const { user } = useAuth();
  const isSales = user.role === 'SALES';

  const [enquiries, setEnquiries] = useState([]);
  const [products, setProducts] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [convertedQuotationIds, setConvertedQuotationIds] = useState(new Set());
  const [loadError, setLoadError] = useState('');

  const [enquiryId, setEnquiryId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [items, setItems] = useState([{ ...emptyItem }]);

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  async function loadAll() {
    try {
      const [enquiriesRes, productsRes, quotationsRes, salesOrdersRes] = await Promise.all([
        api.get('/enquiries'),
        api.get('/products'),
        api.get('/quotations'),
        api.get('/sales-orders'),
      ]);
      setEnquiries(enquiriesRes.data);
      setProducts(productsRes.data);
      setQuotations(quotationsRes.data);
      setConvertedQuotationIds(new Set(salesOrdersRes.data.map((so) => so.quotationId)));
    } catch {
      setLoadError('Failed to load data');
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const quotableEnquiries = enquiries.filter((e) => e.status === 'NEW' || e.status === 'QUOTED');

  function addItemRow() {
    setItems([...items, { ...emptyItem }]);
  }

  function removeItemRow(index) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index, field, value) {
    setItems(
      items.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === 'productId') {
          const product = products.find((p) => String(p.id) === String(value));
          if (product) updated.unitPrice = product.basePrice;
        }
        return updated;
      })
    );
  }

  function resetForm() {
    setEnquiryId('');
    setValidUntil('');
    setItems([{ ...emptyItem }]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    if (!enquiryId) {
      setFormError('Please select an enquiry');
      return;
    }

    const parsedItems = items.map((item) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountPct: Number(item.discountPct),
      gstPct: Number(item.gstPct),
    }));

    if (parsedItems.some((item) => !item.productId || item.quantity <= 0 || item.unitPrice < 0)) {
      setFormError('Every line needs a product, a quantity greater than 0 and a valid unit price');
      return;
    }
    const productIds = parsedItems.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      setFormError('The same product cannot appear twice in one quotation');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/quotations', {
        enquiryId: Number(enquiryId),
        validUntil,
        items: parsedItems,
      });
      resetForm();
      await loadAll();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create quotation');
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(quotationId, status) {
    setActionError('');
    try {
      await api.patch(`/quotations/${quotationId}/status`, { status });
      await loadAll();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to update quotation');
    }
  }

  async function convertToOrder(quotationId) {
    setActionError('');
    try {
      await api.post(`/quotations/${quotationId}/convert`);
      await loadAll();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to convert quotation');
    }
  }

  return (
    <div className="page">
      <h2>Quotations</h2>
      {loadError && <p className="error">{loadError}</p>}
      {actionError && <p className="error">{actionError}</p>}

      {isSales && (
        <form className="panel" onSubmit={handleSubmit}>
          <h3>New Quotation</h3>
          {formError && <p className="error">{formError}</p>}

          <label>
            Enquiry
            <select value={enquiryId} onChange={(e) => setEnquiryId(e.target.value)} required>
              <option value="">Select an enquiry</option>
              {quotableEnquiries.map((enq) => (
                <option key={enq.id} value={enq.id}>
                  {enq.enquiryNumber} - {enq.customer.companyName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Valid Until
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} required />
          </label>

          <h4>Products</h4>
          {items.map((item, index) => (
            <div className="item-row quotation-item-row" key={index}>
              <select
                value={item.productId}
                onChange={(e) => updateItem(index, 'productId', e.target.value)}
                required
              >
                <option value="">Product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit price"
                value={item.unitPrice}
                onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                required
              />
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Disc %"
                value={item.discountPct}
                onChange={(e) => updateItem(index, 'discountPct', e.target.value)}
              />
              <input
                type="number"
                min="0"
                max="100"
                placeholder="GST %"
                value={item.gstPct}
                onChange={(e) => updateItem(index, 'gstPct', e.target.value)}
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
            {submitting ? 'Creating...' : 'Create Quotation'}
          </button>
        </form>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Quotation No.</th>
            <th>Enquiry</th>
            <th>Customer</th>
            <th>Valid Until</th>
            <th>Grand Total</th>
            <th>Status</th>
            {isSales && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {quotations.map((quo) => (
            <tr key={quo.id}>
              <td>{quo.quotationNumber}</td>
              <td>{quo.enquiry.enquiryNumber}</td>
              <td>{quo.enquiry.customer.companyName}</td>
              <td>{quo.validUntil?.slice(0, 10)}</td>
              <td>{quo.grandTotal}</td>
              <td>
                <span className={`badge badge-${quo.status.toLowerCase()}`}>{quo.status}</span>
              </td>
              {isSales && (
                <td className="actions-cell">
                  {quo.status === 'DRAFT' && (
                    <button className="secondary" onClick={() => setStatus(quo.id, 'SENT')}>
                      Send
                    </button>
                  )}
                  {quo.status === 'SENT' && (
                    <>
                      <button className="secondary" onClick={() => setStatus(quo.id, 'ACCEPTED')}>
                        Accept
                      </button>
                      <button className="secondary" onClick={() => setStatus(quo.id, 'REJECTED')}>
                        Reject
                      </button>
                    </>
                  )}
                  {quo.status === 'ACCEPTED' &&
                    (convertedQuotationIds.has(quo.id) ? (
                      <span className="badge">Converted</span>
                    ) : (
                      <button onClick={() => convertToOrder(quo.id)}>Convert to Sales Order</button>
                    ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
