// File: app/customers/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
// Đã sửa đường dẫn import tương đối dựa trên cấu trúc dự án bạn cung cấp
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  StickyNote,
  Calendar,
  DollarSign,
  ShoppingCart,
  Clock,
  Edit3,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/vi";
import { useParams } from "next/navigation";


dayjs.extend(relativeTime);
dayjs.locale("vi");

// --- TYPES Cần thiết ---

// --- TYPES Cần thiết ---

type Customer = {
  id: number;
  code: string | null;
  name: string;
  phone: string | null;
  zalo: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  type: "brand" | "sỉ" | "lẻ";
  created_at: string | null;
};

type Order = {
  id: number;
  order_date: string;
  total_amount: number;
  status: "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "DONE";
  note: string | null;
};

// Định nghĩa màu sắc cho trạng thái Đơn hàng
const ORDER_STATUSES: Record<Order['status'], { label: string; color: string }> = {
  PENDING: { label: "Chờ xác nhận", color: "bg-amber-100 text-amber-700" },
  PROCESSING: { label: "Đang xử lý", color: "bg-blue-100 text-blue-700" },
  SHIPPED: { label: "Đang giao", color: "bg-indigo-100 text-indigo-700" },
  DELIVERED: { label: "Đã giao", color: "bg-emerald-100 text-emerald-700" },
  DONE: { label: "Hoàn thành", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Đã hủy", color: "bg-rose-100 text-rose-700" },
};

const CUSTOMER_TYPES = [
  { value: "brand", label: "Brand", color: "bg-purple-100 text-purple-700 border-purple-300" },
  { value: "sỉ", label: "Khách sỉ", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "lẻ", label: "Khách lẻ", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
] as const;

// --- UTILS ---
function formatMoney(v: number) {
  return v.toLocaleString("vi-VN", { style: "currency", currency: "VND" }).replace("₫", "").trim() + " đ";
}

function getTypeInfo(t: string) {
  return CUSTOMER_TYPES.find(x => x.value === t) || CUSTOMER_TYPES[2];
}

// --- MAIN COMPONENT ---
export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const idString = params?.id;
  const customerId = idString ? parseInt(idString) : NaN;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("Params ID:", idString);
    console.log("Parsed Customer ID:", customerId);

    // 1. Bỏ qua nếu params chưa ổn định (null/undefined)
    if (!idString) return;

    // 2. Check lỗi ID
    if (Number.isNaN(customerId) || customerId <= 0) {
      setError(`ID khách hàng không hợp lệ: '${idString}'`);
      setLoading(false);
      return;
    }

    // 3. Định nghĩa và gọi Fetch Data
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // 1. Fetch Customer
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      if (customerError || !customerData) {
        // Lỗi này sẽ hiển thị thông tin lỗi Supabase cụ thể
        setError(`Lỗi tải chi tiết khách hàng: ${customerError?.message || "Không tìm thấy khách hàng."}`);
        setLoading(false);
        console.error("SUPABASE ERROR:", customerError);
        return;
      }
      setCustomer(customerData as Customer);

      // 2. Fetch Orders
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("id, order_date, total_amount, status, note")
        .eq("customer_id", customerId)
        .order("order_date", { ascending: false });

      if (ordersError) {
        toast.error("Lỗi tải lịch sử đơn hàng.");
        console.error(ordersError);
        setOrders([]);
      } else {
        setOrders(ordersData as Order[]);
      }

      setLoading(false);
    };

    fetchData();
  }, [idString, customerId]);


  // --- PHẦN RENDER JSX ---
  const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
  const activeOrders = orders.filter(o => o.status !== 'DONE' && o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;
  const typeInfo = customer ? getTypeInfo(customer.type) : CUSTOMER_TYPES[2];

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-10 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded-xl w-64 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="h-96 bg-slate-100 rounded-3xl"></div>
            <div className="col-span-2 h-96 bg-slate-100 rounded-3xl"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-10 max-w-7xl mx-auto text-center">
        <h1 className="text-2xl font-bold text-rose-600 mb-4">⚠️ Lỗi tải dữ liệu</h1>
        <p className="text-slate-600 font-medium">{error}</p>
        <p className="text-sm text-slate-500 mt-2">Vui lòng kiểm tra kết nối CSDL và đường dẫn import SupabaseClient.</p>
        <Link href="/customers" className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-slate-200 rounded-xl hover:bg-slate-300 transition text-sm font-medium">
          <ArrowLeft className="w-4 h-4" /> Về danh sách khách hàng
        </Link>
      </div>
    );
  }

  // Success State
  if (!customer) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/customers" className="p-2 rounded-full hover:bg-slate-100 transition text-slate-600" title="Quay lại">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">Chi Tiết Khách hàng: {customer.name}</h1>
            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${typeInfo.color}`}>{typeInfo.label}</span>
          </div>
          <button
            onClick={() => toast.success("Tính năng mở form chỉnh sửa sẽ được tích hợp tại đây. Vui lòng quay lại trang danh sách để Sửa.")}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition shadow-md shadow-emerald-500/30"
          >
            <Edit3 className="w-4 h-4" />
            Sửa thông tin
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Cột 1: Thông tin cơ bản & Thống kê */}
          <section className="lg:col-span-1 space-y-8">
            {/* THỐNG KÊ NHANH */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-800 border-b pb-3 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-blue-500" /> Thống kê giao dịch
              </h2>
              <div className="space-y-4">
                <StatItem icon={ShoppingCart} label="Tổng số đơn hàng" value={`${orders.length} đơn`} color="text-blue-600" />
                <StatItem icon={DollarSign} label="Tổng doanh thu" value={formatMoney(totalRevenue)} color="text-green-600" />
                <StatItem
                  icon={Clock}
                  label="Đơn hàng đang xử lý"
                  value={`${activeOrders} đơn`}
                  color={activeOrders > 0 ? "text-amber-600" : "text-slate-600"}
                />
                <StatItem
                  icon={Calendar}
                  label="Ngày tạo khách hàng"
                  value={dayjs(customer.created_at).format("HH:mm, DD/MM/YYYY")}
                  color="text-purple-600"
                />
              </div>
            </div>

            {/* THÔNG TIN LIÊN HỆ */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-800 border-b pb-3 mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5 text-red-500" /> Chi tiết liên hệ
              </h2>
              <ContactItem icon={Phone} label="SĐT" value={customer.phone} />
              <ContactItem icon={ExternalLink} label="Zalo" value={customer.zalo} isLink={true} />
              <ContactItem icon={Mail} label="Email" value={customer.email} />
              <ContactItem icon={MapPin} label="Địa chỉ" value={customer.address} isAddress={true} />
              <ContactItem icon={StickyNote} label="Ghi chú" value={customer.note} isNote={true} />
            </div>
          </section>

          {/* Cột 2: Lịch sử đơn hàng */}
          <section className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-900 border-b pb-3 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-6 h-6 text-emerald-600" /> Lịch sử Đơn hàng ({orders.length})
              </h2>

              {orders.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-3" />
                  <p className="font-semibold">Chưa có đơn hàng nào từ khách hàng này.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2">
                  {orders.map((order, index) => (
                    <OrderItem key={order.id} order={order} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

// --- SUB-COMPONENTS (Giữ nguyên) ---

// 1. Stat Item Component
function StatItem({ icon: Icon, label, value, color }: { icon: any, label: string, value: string, color: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <span className={`text-base font-bold ${color}`}>{value}</span>
    </div>
  );
}

// 2. Contact Item Component
function ContactItem({ icon: Icon, label, value, isLink = false, isAddress = false, isNote = false }: { icon: any, label: string, value: string | null, isLink?: boolean, isAddress?: boolean, isNote?: boolean }) {
  if (!value) return null;

  const content = isLink ? (
    <a
      href={value.startsWith('http') ? value : `https://zalo.me/${value}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:underline"
    >
      {value}
    </a>
  ) : (
    <span className="text-slate-800">{value}</span>
  );

  return (
    <div className={`flex ${isNote || isAddress ? 'flex-col' : 'items-center'} mb-3`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-600">{label}:</span>
      </div>
      <p className={`text-sm ${isNote || isAddress ? 'ml-6 p-2 bg-slate-50 rounded-lg whitespace-pre-wrap' : 'ml-auto font-semibold'}`}>{content}</p>
    </div>
  );
}

// 3. Order Item Component
function OrderItem({ order }: { order: Order }) {
  const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.PENDING;
  const orderDate = dayjs(order.order_date).format("HH:mm, DD/MM/YYYY");
  const totalAmount = formatMoney(order.total_amount);

  return (
    <div className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition bg-white flex justify-between items-center">
      <div className="space-y-1">
        <p className="text-base font-bold text-slate-900 flex items-center gap-2">
          Đơn hàng #{order.id}
        </p>
        <div className="flex items-center text-sm text-slate-600 gap-4">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-400" /> {orderDate}
          </span>
          <span className="flex items-center gap-1 font-semibold text-emerald-700">
            <DollarSign className="w-3 h-3" /> {totalAmount}
          </span>
        </div>
        {order.note && (
          <p className="text-xs text-slate-500 mt-1 italic line-clamp-1">Ghi chú: {order.note}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${statusInfo.color} whitespace-nowrap`}>
          {statusInfo.label}
        </span>
        <Link
          href={`/orders/${order.id}`}
          className="p-2 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition"
          title="Xem chi tiết đơn hàng"
        >
          <ChevronLeft className="w-4 h-4 rotate-180" />
        </Link>
      </div>
    </div>
  );
}