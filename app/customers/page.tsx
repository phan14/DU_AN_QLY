"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";
import {
  Search,
  UserPlus,
  Trash2,
  Phone,
  Mail,
  MapPin,
  StickyNote,
  Calendar,
  Edit3,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  DollarSign,
  ShoppingCart,
  Clock,
  ExternalLink,
} from "lucide-react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime"; // Để hiển thị "vài ngày trước"
import "dayjs/locale/vi"; // Sử dụng locale Tiếng Việt

dayjs.extend(relativeTime);
dayjs.locale("vi");

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
  orderCount: number;
  activeOrderCount: number;
  totalRevenue: number;
  lastOrderDate: string | null;
};

const CUSTOMER_TYPES = [
  { value: "brand", label: "Brand", color: "bg-purple-100 text-purple-700 border-purple-300" },
  { value: "sỉ", label: "Khách sỉ", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "lẻ", label: "Khách lẻ", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
] as const;

const PAGE_SIZES = [10, 25, 50];

function formatMoney(v: number) {
  return v > 0 ? v.toLocaleString("vi-VN", { style: "currency", currency: "VND" }).replace("₫", "").trim() + " đ" : "0 đ";
}

// Hàm này giúp định dạng ngày thân thiện hơn
function formatDate(date: string | null): string {
  if (!date) return "Chưa có đơn";
  const d = dayjs(date);
  const daysAgo = dayjs().diff(d, 'day');
  if (daysAgo <= 7) {
    return d.fromNow(); // Ví dụ: 3 ngày trước
  }
  return d.format("DD/MM/YYYY");
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // === Bộ lọc & Tìm kiếm (Client-side search, Server-side filter/pagination) ===
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"brand" | "sỉ" | "lẻ" | "">("");
  // Dùng state này để filter client-side, nhưng server-side vẫn tải hết theo type/pagination.
  const [activeOrdersFilter, setActiveOrdersFilter] = useState<"yes" | "no" | "">("");

  // === Phân trang ===
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, totalCount);

  // Form state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [zalo, setZalo] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<"brand" | "sỉ" | "lẻ">("lẻ");

  // Edit mode
  const [editingId, setEditingId] = useState<number | null>(null);

  // === VALIDATION FUNCTIONS ===
  const validatePhone = (phone: string): string | null => {
    if (!phone.trim()) return null;
    const cleaned = phone.replace(/[\s\-\(\)]/g, "");
    const phoneRegex = /^0\d{8,10}$/; // 9-11 số (bắt đầu bằng 0, 8-10 chữ số sau)
    if (!/^\d+$/.test(cleaned)) return "Chỉ được chứa số";
    if (cleaned.length < 9 || cleaned.length > 11) return "Phải có 9-11 số";
    if (!phoneRegex.test(cleaned)) return "Không hợp lệ (VD: 0901234567)";
    return null;
  };

  const validateZalo = (zalo: string): string | null => {
    if (!zalo.trim()) return null;
    const trimmed = zalo.trim();
    if (trimmed.startsWith("http")) {
      try {
        new URL(trimmed);
        if (!trimmed.includes("zalo.me")) return "Phải là link Zalo.me";
        return null;
      } catch {
        return "Link Zalo không hợp lệ";
      }
    } else {
      return validatePhone(trimmed); // Nếu không phải link, coi là SĐT
    }
  };

  const validateEmail = (email: string): string | null => {
    if (!email.trim()) return null;
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Email không hợp lệ";
    return null;
  };

  // === DATA FETCHING ===
  const buildQuery = () => {
    let query = supabase
      .from("customers")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (typeFilter) {
      query = query.eq("type", typeFilter);
    }

    return query;
  };

  const loadCustomers = async () => {
    setLoading(true);
    setCustomers([]); // Clear old data

    const query = buildQuery();

    // 1. Đếm tổng
    const { count, error: countError } = await query;
    if (countError || count === null) {
      toast.error("Lỗi đếm khách hàng. Vui lòng thử lại.");
      setLoading(false);
      return;
    }
    setTotalCount(count);

    // 2. Lấy dữ liệu theo trang
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: customersData, error } = await query.range(from, to);

    if (error) {
      console.error(error);
      toast.error("Lỗi tải danh sách: " + error.message);
      setLoading(false);
      return;
    }

    // 3. Tải tất cả orders để tính stats cho khách hàng HIỆN TẠI trên trang này
    const customerIds = customersData.map(c => c.id);
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("customer_id, order_date, total_amount, status")
      .in("customer_id", customerIds); // Chỉ lấy đơn của khách hàng đang hiển thị

    if (ordersError) {
      console.error(ordersError);
      toast.error("Lỗi tải đơn hàng để tính thống kê. Dữ liệu bảng có thể thiếu.");
    }

    const orders = ordersData ?? [];

    // 4. Tính stats per customer
    const customerStats = new Map<number, { orderCount: number; activeOrderCount: number; totalRevenue: number; lastOrderDate: string | null }>();

    for (const order of orders) {
      if (!order.customer_id) continue;
      const stats = customerStats.get(order.customer_id) || { orderCount: 0, activeOrderCount: 0, totalRevenue: 0, lastOrderDate: null };

      stats.orderCount += 1;
      stats.totalRevenue += Number(order.total_amount) || 0;

      const isFinished = order.status === "DONE" || order.status === "DELIVERED" || order.status === "CANCELLED";
      if (!isFinished) stats.activeOrderCount += 1; // Đơn đang xử lý

      if (!stats.lastOrderDate || order.order_date > stats.lastOrderDate) {
        stats.lastOrderDate = order.order_date;
      }

      customerStats.set(order.customer_id, stats);
    }

    // 5. Kết hợp dữ liệu
    const enrichedCustomers: Customer[] = (customersData as Omit<Customer, "orderCount" | "activeOrderCount" | "totalRevenue" | "lastOrderDate">[]).map(c => ({
      ...c,
      orderCount: 0,
      activeOrderCount: 0,
      totalRevenue: 0,
      lastOrderDate: null,
      ...customerStats.get(c.id),
    }));

    setCustomers(enrichedCustomers);
    setLoading(false);
  };

  // Tải lại khi thay đổi filter/page size
  useEffect(() => {
    setPage(1);
    loadCustomers();
  }, [typeFilter, pageSize]);

  // Tải lại khi thay đổi trang
  useEffect(() => {
    loadCustomers();
  }, [page]);

  // === CLIENT-SIDE FILTERING & SEARCHING ===
  const filteredCustomers = useMemo(() => {
    let list = customers;

    // Lọc theo đơn hàng đang xử lý (Client-side)
    if (activeOrdersFilter === "yes") {
      list = list.filter(c => c.activeOrderCount > 0);
    } else if (activeOrdersFilter === "no") {
      list = list.filter(c => c.activeOrderCount === 0);
    }

    // Tìm kiếm (Client-side)
    if (search.trim()) {
      const keyword = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(keyword) ||
        (c.code && c.code.toLowerCase().includes(keyword)) ||
        (c.phone && c.phone.includes(keyword)) ||
        (c.email && c.email.toLowerCase().includes(keyword))
      );
    }

    return list;
  }, [customers, search, activeOrdersFilter]);

  // === FORM HANDLERS ===
  const resetForm = () => {
    setCode(""); setName(""); setPhone(""); setZalo(""); setEmail(""); setAddress(""); setNote("");
    setType("lẻ");
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Tên khách hàng không được để trống!");
      return;
    }
    const phoneError = validatePhone(phone);
    if (phoneError) {
      toast.error("Số điện thoại: " + phoneError);
      return;
    }
    const zaloError = validateZalo(zalo);
    if (zaloError) {
      toast.error("Zalo: " + zaloError);
      return;
    }
    const emailError = validateEmail(email);
    if (emailError) {
      toast.error("Email: " + emailError);
      return;
    }

    setSaving(true);
    const payload = {
      code: code.trim() || null,
      name: name.trim(),
      phone: phone.trim() || null,
      zalo: zalo.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      note: note.trim() || null,
      type,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("customers").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("customers").insert(payload));
    }

    setSaving(false);
    if (error) {
      toast.error(`Lỗi ${editingId ? "cập nhật" : "thêm"}: ` + error.message);
      return;
    }

    toast.success(`Đã ${editingId ? "cập nhật" : "thêm"} khách hàng ${name.trim()} thành công!`);
    resetForm();
    await loadCustomers();
  };

  const startEdit = (c: Customer) => {
    setEditingId(c.id);
    setCode(c.code || "");
    setName(c.name);
    setPhone(c.phone || "");
    setZalo(c.zalo || "");
    setEmail(c.email || "");
    setAddress(c.address || "");
    setNote(c.note || "");
    setType(c.type);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: number) => {
    const customerToDelete = customers.find(c => c.id === id);
    if (!customerToDelete) return;

    // Check for existing orders
    if (customerToDelete.orderCount > 0) {
      toast.error(`Không thể xóa: Khách đã có ${customerToDelete.orderCount} đơn đặt may. Vui lòng chỉnh sửa thay vì xóa.`);
      return;
    }

    if (!confirm(`Bạn có chắc muốn xóa khách hàng "${customerToDelete.name}"? Dữ liệu sẽ mất vĩnh viễn.`)) return;


    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) {
      toast.error("Lỗi xóa: " + error.message);
      return;
    }

    toast.success(`Đã xóa khách hàng "${customerToDelete.name}" thành công!`);
    await loadCustomers();
  };

  const getTypeInfo = (t: string) => CUSTOMER_TYPES.find(x => x.value === t) || CUSTOMER_TYPES[2];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-6 h-6 text-emerald-600" />
              Quản lý Khách hàng
            </h1>
            <span className="px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full hidden sm:inline">
              {CUSTOMER_TYPES.map(t => t.label).join(" • ")}
            </span>
          </div>
          <Link
            href="/"
            className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-100 transition shadow-sm"
          >
            Trang chủ
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Form Thêm / Sửa (Cột trái, 4/12) */}
          <section className="lg:col-span-4">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 sticky top-8">
              <div className="flex items-center justify-between mb-6 border-b pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-50 rounded-xl">
                    {editingId ? <Edit3 className="w-5 h-5 text-emerald-600" /> : <UserPlus className="w-5 h-5 text-emerald-600" />}
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {editingId ? "Chỉnh sửa khách hàng" : "Thêm khách hàng mới"}
                  </h2>
                </div>
                {editingId && (
                  <button
                    onClick={resetForm}
                    title="Hủy bỏ chỉnh sửa"
                    className="p-2 text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-full transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Mã khách, Tên khách */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Mã khách (tùy chọn)</label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="BRAND01, KH001..."
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Tên khách hàng <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Tên brand / tên cá nhân"
                      required
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Loại khách hàng */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Phân loại</label>
                  <div className="grid grid-cols-3 gap-3">
                    {CUSTOMER_TYPES.map((t) => (
                      <label
                        key={t.value}
                        className={`flex items-center justify-center px-3 py-2 rounded-xl border-2 text-sm font-medium cursor-pointer transition shadow-sm ${type === t.value
                          ? `${t.color.replace("bg-", "bg-")} border-emerald-500 ring-2 ring-offset-2 ring-emerald-500`
                          : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                          }`}
                      >
                        <input
                          type="radio"
                          name="type"
                          value={t.value}
                          checked={type === t.value}
                          onChange={(e) => setType(e.target.value as any)}
                          className="sr-only"
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* SĐT, Zalo */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">SĐT</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0901234567"
                        className={`w-full pl-11 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 ${phone && validatePhone(phone)
                          ? "border-rose-500 focus:ring-rose-500"
                          : "border-slate-300 focus:ring-emerald-500"
                          }`}
                      />
                    </div>
                    {phone && validatePhone(phone) && (
                      <p className="mt-1 text-xs text-rose-600 font-medium">{validatePhone(phone)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Zalo</label>
                    <input
                      type="text"
                      value={zalo}
                      onChange={(e) => setZalo(e.target.value)}
                      placeholder="SĐT hoặc link zalo.me/..."
                      className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 ${zalo && validateZalo(zalo)
                        ? "border-rose-500 focus:ring-rose-500"
                        : "border-slate-300 focus:ring-emerald-500"
                        }`}
                    />
                    {zalo && validateZalo(zalo) && (
                      <p className="mt-1 text-xs text-rose-600 font-medium">{validateZalo(zalo)}</p>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="brand@example.com"
                      className={`w-full pl-11 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 ${email && validateEmail(email)
                        ? "border-rose-500 focus:ring-rose-500"
                        : "border-slate-300 focus:ring-emerald-500"
                        }`}
                    />
                  </div>
                  {email && validateEmail(email) && (
                    <p className="mt-1 text-xs text-rose-600 font-medium">{validateEmail(email)}</p>
                  )}
                </div>

                {/* Địa chỉ */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Địa chỉ</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Số nhà, phường, quận..."
                      className="w-full pl-11 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Ghi chú */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Ghi chú</label>
                  <div className="relative">
                    <StickyNote className="absolute left-4 top-3 w-4 h-4 text-slate-400" />
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder="Yêu cầu đặc biệt, thanh toán, bao bì..."
                      className="w-full pl-11 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="w-full mt-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>Đang lưu...</>
                  ) : (
                    <>
                      {editingId ? <Edit3 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                      {editingId ? "Cập nhật khách hàng" : "Thêm khách hàng"}
                    </>
                  )}
                </button>
              </form>
            </div>
          </section>

          {/* Danh sách khách (Cột phải, 8/12) */}
          <section className="lg:col-span-8">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">

              {/* Thanh tìm kiếm & bộ lọc */}
              <div className="p-5 border-b border-slate-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <h2 className="text-xl font-bold text-slate-900">Danh sách Khách hàng</h2>

                  <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    {/* Bộ lọc loại */}
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-slate-500 hidden sm:inline" />
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as any)}
                        className="px-4 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Tất cả loại</option>
                        {CUSTOMER_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      {/* Bộ lọc đơn đang xử lý */}
                      <select
                        value={activeOrdersFilter}
                        onChange={(e) => setActiveOrdersFilter(e.target.value as any)}
                        className="px-4 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Tất cả đơn hàng</option>
                        <option value="yes">Có đơn đang xử lý</option>
                        <option value="no">Không có đơn đang xử lý</option>
                      </select>
                    </div>

                    {/* Tìm kiếm */}
                    <div className="relative flex-grow">
                      <Search className="absolute left-4 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm tên, mã, SĐT..."
                        className="pl-11 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-sm text-slate-500 mt-3">
                  Hiển thị <strong>{filteredCustomers.length}</strong> khách hàng trong kết quả tìm kiếm.
                </p>
              </div>

              {loading ? (
                <div className="p-6">
                  <div className="animate-pulse space-y-4">
                    {[...Array(pageSize)].map((_, i) => (
                      <div key={i} className="h-10 bg-slate-100 rounded-lg"></div>
                    ))}
                  </div>
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <div className="bg-slate-50 w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center border-4 border-slate-100">
                    <Search className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-xl font-semibold">Không tìm thấy khách hàng nào</p>
                  <p className="text-sm mt-1">Hãy thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider min-w-[100px]">Tên & Mã khách</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider min-w-[100px]">Loại</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider min-w-[120px]">Liên hệ</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider min-w-[80px]">Tổng đơn</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider min-w-[100px]">Doanh thu</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider min-w-[120px]">Gần nhất đặt</th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider min-w-[150px]">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {filteredCustomers.map((c) => {
                          const typeInfo = getTypeInfo(c.type);
                          const contact = c.phone || c.zalo || "-";
                          const lastDate = formatDate(c.lastOrderDate);
                          return (
                            <tr key={c.id} className="hover:bg-emerald-50/50 transition duration-150">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                                <p className="text-xs text-slate-500 mt-1">{c.code || `ID: ${c.id}`}</p>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${typeInfo.color}`}>
                                  {typeInfo.label}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                                <p className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-500" />
                                  <span>{c.phone || '-'}</span>
                                </p>
                                {c.zalo && (
                                  <p className="flex items-center gap-1 mt-1">
                                    <ExternalLink className="w-3 h-3 text-slate-500" />
                                    <a href={c.zalo.startsWith('http') ? c.zalo : `https://zalo.me/${c.zalo}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-[100px] text-xs">
                                      Zalo
                                    </a>
                                  </p>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                <p className="font-semibold text-slate-900">{c.orderCount}</p>
                                {c.activeOrderCount > 0 && (
                                  <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-medium mt-1 inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {c.activeOrderCount} Đơn chờ
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right text-emerald-700">{formatMoney(c.totalRevenue)}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{lastDate}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                <div className="flex justify-center items-center space-x-2">
                                  <Link href={`/customers/${c.id}`} title="Xem chi tiết" className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition">
                                    <ExternalLink className="w-4 h-4" />
                                  </Link>
                                  <button onClick={() => startEdit(c)} title="Chỉnh sửa" className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition">
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleDelete(c.id)} title="Xóa khách hàng" className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Phân trang */}
                  {totalPages > 1 && (
                    <div className="border-t border-slate-200 px-5 py-4 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">

                      {/* Hiển thị số trang */}
                      <div className="text-slate-600 font-medium">
                        Trang <strong>{page}</strong> / <strong>{totalPages}</strong> (Tổng cộng: <strong>{totalCount}</strong> khách)
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Chọn kích thước trang */}
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600">Hiển thị:</span>
                          <select
                            value={pageSize}
                            onChange={(e) => {
                              setPageSize(Number(e.target.value));
                              setPage(1);
                            }}
                            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            {PAGE_SIZES.map(size => (
                              <option key={size} value={size}>{size} / trang</option>
                            ))}
                          </select>
                        </div>

                        {/* Các nút điều hướng */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPage(1)}
                            disabled={page === 1}
                            title="Về trang đầu"
                            className="p-2 rounded-full bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition border border-slate-300 shadow-sm"
                          >
                            <ChevronsLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            title="Trang trước"
                            className="p-2 rounded-full bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition border border-slate-300 shadow-sm"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>

                          <span className="px-4 py-2 font-bold text-slate-800 bg-emerald-100 rounded-full">
                            {page}
                          </span>

                          <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            title="Trang sau"
                            className="p-2 rounded-full bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition border border-slate-300 shadow-sm"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setPage(totalPages)}
                            disabled={page === totalPages}
                            title="Về trang cuối"
                            className="p-2 rounded-full bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition border border-slate-300 shadow-sm"
                          >
                            <ChevronsRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}