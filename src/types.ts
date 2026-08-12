export type Role = "ADMIN" | "SUPERVISOR" | "EMPLOYEE";
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER";
export type OrderStatus = "PENDING" | "PAID" | "CANCELLED";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  active: number | boolean;
}

export interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Order {
  id: number;
  customer_name: string;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  total: number;
  created_at: string;
  items: OrderItem[];
}

export interface CashSession {
  id: number;
  user_id: number;
  user_name: string;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference_amount: number | null;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
}

