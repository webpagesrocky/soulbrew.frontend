export type Role = "ADMIN" | "SUPERVISOR" | "EMPLOYEE";
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER";
export type OrderStatus = "PENDING" | "PAID" | "CANCELLED";
export type ProductCategory = "MATCHA" | "CAFE" | "CHAI" | "REFRESHER" | "TONICOS";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date | null;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  price: number;
  stock: number;
  active: boolean;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  code: string;
  customerName: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  total: number;
  items: OrderItem[];
  cashSessionId: string | null;
  createdAt: Date | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

export interface CashTotals {
  cashTotal: number;
  cardTotal: number;
  transferTotal: number;
  salesTotal: number;
  saleCount: number;
}

export interface CashSession {
  id: string;
  userId: string;
  userName: string;
  openingAmount: number;
  closingAmount: number | null;
  expectedAmount: number | null;
  differenceAmount: number | null;
  totals: CashTotals | null;
  status: "OPEN" | "CLOSED";
  openedAt: Date | null;
  closedAt: Date | null;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  userId: string;
  userName: string;
  quantityChange: number;
  reason: string;
  createdAt: Date | null;
}
