import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Nav from './components/Nav';
import Login from './pages/Login';
import Enquiries from './pages/Enquiries';
import Quotations from './pages/Quotations';
import './App.css';

function AppRoutes() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/enquiries"
          element={
            <ProtectedRoute>
              <Enquiries />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotations"
          element={
            <ProtectedRoute>
              <Quotations />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/enquiries" replace />} />
        <Route path="*" element={<Navigate to="/enquiries" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
