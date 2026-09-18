import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FinancialPage from './pages/FinancialPage';
import OrdersPage from './pages/OrdersPage';
import SalesPage from './pages/SalesPage';
import CompanyPage from './pages/CompanyPage';
import CategoriesPage from './pages/CategoriesPage';
import MaterialsPage from './pages/MaterialsPage';
import ProductsPage from './pages/ProductsPage';
import WarehousePage from './pages/WarehousePage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/financial"
            element={
              <ProtectedRoute>
                <FinancialPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <OrdersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales"
            element={
              <ProtectedRoute>
                <SalesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/perusahaan"
            element={
              <ProtectedRoute>
                <CompanyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kategori"
            element={
              <ProtectedRoute>
                <CategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/materials"
            element={
              <ProtectedRoute>
                <MaterialsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/products"
            element={
              <ProtectedRoute>
                <ProductsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gudang"
            element={
              <ProtectedRoute>
                <WarehousePage />
              </ProtectedRoute>
            }
          />
          <Route path="/kategori-produk" element={<Navigate to="/kategori" replace />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
