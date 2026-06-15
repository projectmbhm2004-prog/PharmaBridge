import { Routes, Route, Navigate } from "react-router-dom";

import Landing from "@/pages/Landing";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import VerifyEmail from "@/pages/VerifyEmail";
import NotFound from "@/pages/NotFound";

import PrivateRoute from "@/components/shared/PrivateRoute";
import Registrations from "@/pages/admin/Registrations";
import AdminOrders from "@/pages/admin/Orders";
import Categories from "@/pages/admin/Categories";
import ProductTypes from "@/pages/admin/ProductTypes";
import AdminMarket from "@/pages/admin/Market";
import Companies from "@/pages/admin/Companies";
import Pharmacies from "@/pages/admin/Pharmacies";
import AdminDrivers from "@/pages/admin/Drivers";
import Reports from "@/pages/admin/Reports";

import CompanyOrders from "@/pages/company/Orders";
import CompanyProducts from "@/pages/company/Products";
import CompanyDrivers from "@/pages/company/Drivers";
import CompanyFinancial from "@/pages/company/Financial";
import CompanyMarket from "@/pages/company/Market";

import PharmacyMarket from "@/pages/pharmacy/Market";
import ProductDetail from "@/pages/pharmacy/ProductDetail";
import Cart from "@/pages/pharmacy/Cart";
import PharmacyOrders from "@/pages/pharmacy/Orders";
import PharmacyFinancial from "@/pages/pharmacy/Financial";

import DriverOrders from "@/pages/driver/Orders";
import DriverDelivery from "@/pages/driver/Delivery";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Admin (role-scoped via PrivateRoute → Outlet) */}
      <Route path="/admin" element={<PrivateRoute allowedRoles={["admin"]} />}>
        <Route index element={<Navigate to="/admin/registrations" replace />} />
        <Route path="registrations" element={<Registrations />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="categories" element={<Categories />} />
        <Route path="product-types" element={<ProductTypes />} />
        <Route path="market" element={<AdminMarket />} />
        <Route path="companies" element={<Companies />} />
        <Route path="pharmacies" element={<Pharmacies />} />
        <Route path="drivers" element={<AdminDrivers />} />
        <Route path="reports" element={<Reports />} />
      </Route>

      {/* Company (role-scoped via PrivateRoute → Outlet) */}
      <Route path="/company" element={<PrivateRoute allowedRoles={["company"]} />}>
        <Route index element={<Navigate to="/company/orders" replace />} />
        <Route path="orders" element={<CompanyOrders />} />
        <Route path="products" element={<CompanyProducts />} />
        <Route path="drivers" element={<CompanyDrivers />} />
        <Route path="financial" element={<CompanyFinancial />} />
        <Route path="market" element={<CompanyMarket />} />
      </Route>

      {/* Pharmacy (role-scoped via PrivateRoute → Outlet) */}
      <Route path="/pharmacy" element={<PrivateRoute allowedRoles={["pharmacy"]} />}>
        <Route index element={<Navigate to="/pharmacy/market" replace />} />
        <Route path="market" element={<PharmacyMarket />} />
        <Route path="product/:id" element={<ProductDetail />} />
        <Route path="cart" element={<Cart />} />
        <Route path="orders" element={<PharmacyOrders />} />
        <Route path="financial" element={<PharmacyFinancial />} />
      </Route>

      {/* Driver (role-scoped via PrivateRoute → Outlet) */}
      <Route path="/driver" element={<PrivateRoute allowedRoles={["driver"]} />}>
        <Route index element={<Navigate to="/driver/orders" replace />} />
        <Route path="orders" element={<DriverOrders />} />
        <Route path="delivery/:id" element={<DriverDelivery />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
