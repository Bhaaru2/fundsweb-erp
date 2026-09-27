import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Nav() {
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <nav className="nav">
      <div className="nav-brand">FundsWeb ERP</div>
      <div className="nav-links">
        <Link to="/enquiries">Enquiries</Link>
        <Link to="/quotations">Quotations</Link>
      </div>
      <div className="nav-user">
        <span>
          {user.name} ({user.role})
        </span>
        <button className="secondary" onClick={logout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
