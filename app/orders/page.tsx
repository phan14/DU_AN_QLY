"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { supabase } from "../lib/supabaseClient";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Package,
  Calendar,
  User,
  Filter,
  X
} from "lucide-react";

type OrderRow = {
  id: number;
  order_code: string | null;
  customer_name: string | null;
  order_date: string | null;
  start_date: string | null;
  due_date: string | null;
  actual_delivery_date: string | null;
  status: string | null;
  manual_status: string | null;
  main_image_url: string | null;
  total_amount: string | null;
  items_summary: string;
  total_planned: number;
  total_actual: number;
};

type Customer = {
  id: number;
  name: string;
  code: string | null;
};

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "NEW", label: "Mới tạo" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "CUTTING", label: "Đang cắt" },
  { value: "SEWING", label: "Đang may" },
  { value: "FINISHING", label: "Hoàn thiện" },
  { value: "DONE", label: "Hoàn thành (chờ giao)" },
  { value: "DELIVERED", label: "Đã giao" },
  { value: "CANCELLED", label: "Đã huỷ" },
];

const PAGE_SIZES = [10, 25, 50];

function getDaysLeft(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const today = dayjs().startOf("day");
  const due = dayjs(dueDate);
  return due.diff(today, "day");
}

function buildAutoStatus(
  dueDate: string | null,
  actualDeliveryDate: string | null,
  status: string | null
): string {
  const baseStatus = status?.toUpperCase() || "";
  if (baseStatus === "DELIVERED") return "HOÀN THÀNH";
  if (baseStatus === "CANCELLED") return "ĐÃ HUỶ";
  if (actualDeliveryDate) return "HOÀN THÀNH";
  if (!dueDate) return "CHƯA CÓ HẠN GIAO";
  const daysLeft = getDaysLeft(dueDate);
  if (daysLeft === null) return "CHƯA CÓ HẠN GIAO";
  if (daysLeft === 0) return "HẠN GIAO HÔM NAY";
  if (daysLeft < 0) return "QUÁ HẠN";
  if (daysLeft <= 3) return "SẮP ĐẾN HẠN";
  if (baseStatus === "CUTTING") return "ĐANG CẮT";
  if (baseStatus === "SEWING") return "ĐANG MAY";
  if (baseStatus === "FINISHING") return "ĐANG HOÀN THIỆN";
  return "ĐANG XỬ LÝ";
}

function getRowClass(autoStatus: string) {
  if (autoStatus === "HOÀN THÀNH" || autoStatus === "ĐÃ GIAO") return "bg-emerald-50";
  if (autoStatus === "QUÁ HẠN") return "bg-rose-50";
  if (autoStatus === "SẮP ĐẾN HẠN" || autoStatus === "HẠN GIAO HÔM NAY") return "bg-amber-50";
  return "";
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // === Bộ lọc ===
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");

  // === Phân trang ===
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, totalCount);

  // Load customers
  useEffect(() => {
    const loadCustomers = async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, code")
        .order("name", { ascending: true });
      if (data) setCustomers(data);
    };
    loadCustomers();
  }, []);

  const buildQuery = () => {
    let query = supabase
      .from("orders")
      .select(
        `
        id,
        order_code,
        order_date,
        start_date,
        due_date,
        actual_delivery_date,
        status,
        manual_status,
        total_amount,
        main_image_url,
        customers ( name ),
        order_items (
          product_name,
          quantity,
          actual_quantity,
          unit_price
        )
      `,
        { count: "exact" }
      )
      .order("due_date", { ascending: true, nullsLast: true });

    // Lọc trạng thái
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    // Lọc khách hàng
    if (customerFilter) {
      query = query.eq("customer_id", +customerFilter);
    }

    // Lọc ngày đặt
    if (orderDateFrom) {
      query = query.gte("order_date", orderDateFrom);
    }
    if (orderDateTo) {
      query = query.lte("order_date", orderDateTo);
    }

    // Lọc ngày giao
    if (dueDateFrom) {
      query = query.gte("due_date", dueDateFrom);
    }
    if (dueDateTo) {
      query = query.lte("due_date", dueDateTo);
    }

    return query;
  };

  const loadOrders = async () => {
    setLoading(true);

    const query = buildQuery();

    // Đếm tổng
    const { count, error: countError } = await query;

    if (countError || count === null) {
      alert("Lỗi đếm đơn hàng");
      setLoading(false);
      return;
    }

    // Lấy dữ liệu theo trang
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await query.range(from, to);

    if (error) {
      console.error(error);
      alert("Lỗi tải danh sách: " + error.message);
    } else {
      const rows: OrderRow[] =
        data?.map((row: any) => {
          const items = row.order_items || [];
          const itemsSummary = items
            .map(
              (it: any) =>
                `${it.product_name} (${it.quantity}/${it.actual_quantity ?? "-"}) @ ${it.unit_price?.toLocaleString("vi-VN") ?? "-"} đ`
            )
            .join(", ");
          const totalPlanned = items.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0);
          const totalActual = items.reduce((sum: number, it: any) => sum + (it.actual_quantity || 0), 0);

          return {
            id: row.id,
            order_code: row.order_code,
            order_date: row.order_date,
            start_date: row.start_date,
            due_date: row.due_date,
            actual_delivery_date: row.actual_delivery_date,
            status: row.status,
            manual_status: row.manual_status,
            total_amount: row.total_amount,
            customer_name: row.customers?.name ?? null,
            main_image_url: row.main_image_url,
            items_summary: itemsSummary || "Chưa có items",
            total_planned: totalPlanned,
            total_actual: totalActual,
          };
        }) ?? [];

      setOrders(rows.filter(o => o.total_planned > 0));
      setTotalCount(count);
    }
    setLoading(false);
  };

  // Tải khi thay đổi bộ lọc hoặc trang
  useEffect(() => {
    setPage(1);
    loadOrders();
  }, [statusFilter, customerFilter, orderDateFrom, orderDateTo, dueDateFrom, dueDateTo, page, pageSize]);

  // Tìm kiếm debounce
  useEffect(() => {
    const delay = setTimeout(() => {
      setPage(1);
      loadOrders();
    }, 500);
    return () => clearTimeout(delay);
  }, [search]);

  // Lọc client-side cho tìm kiếm
  const filteredOrders = orders.filter((o) => {
    if (!search.trim()) return true;
    const keyword = search.toLowerCase();
    return (
      (o.order_code || `#${o.id}`)?.toLowerCase().includes(keyword) ||
      (o.customer_name || "").toLowerCase().includes(keyword)
    );
  });

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setCustomerFilter("");
    setOrderDateFrom("");
    setOrderDateTo("");
    setDueDateFrom("");
    setDueDateTo("");
  };

  const hasActiveFilters =
    statusFilter || customerFilter || orderDateFrom || orderDateTo || dueDateFrom || dueDateTo;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Modal preview hình */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>
      )}

      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-6 h-6 text-emerald-600" />
              Đơn đặt may
            </h1>
            <p className="text-sm text-slate-500 mt-1">Lọc, tìm kiếm & phân trang toàn diện</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
            >
              Trang chủ
            </Link>
            <Link
              href="/orders/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium shadow-sm hover:bg-emerald-700 transition"
            >
              + Tạo đơn mới
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Bộ lọc nâng cao */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Filter className="w-5 h-5 text-emerald-600" />
              Bộ lọc
            </h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                <X className="w-4 h-4" /> Xóa bộ lọc
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Tìm kiếm */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tìm kiếm</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Mã đơn, tên khách..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <Package className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* Trạng thái */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Trạng thái</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Khách hàng */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Khách hàng</label>
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Tất cả khách</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} - ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Ngày đặt: Từ */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                <Calendar className="w-4 h-4" /> Ngày đặt từ
              </label>
              <input
                type="date"
                value={orderDateFrom}
                onChange={(e) => setOrderDateFrom(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Ngày đặt: Đến */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Đến</label>
              <input
                type="date"
                value={orderDateTo}
                onChange={(e) => setOrderDateTo(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Ngày giao: Từ */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Hạn giao từ</label>
              <input
                type="date"
                value={dueDateFrom}
                onChange={(e) => setDueDateFrom(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Ngày giao: Đến */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Đến</label>
              <input
                type="date"
                value={dueDateTo}
                onChange={(e) => setDueDateTo(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Bảng + Phân trang */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Mã đơn</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Hình</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Khách</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Ngày đặt</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Hạn giao</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Còn</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Trạng thái</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Tự động</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Sản phẩm</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Tổng</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                      </div>
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                      <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p>Không có đơn hàng phù hợp</p>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => {
                    const daysLeft = getDaysLeft(o.due_date);
                    const autoStatus = buildAutoStatus(o.due_date, o.actual_delivery_date, o.status);
                    const rowClass = getRowClass(autoStatus);
                    const statusLabel = STATUS_OPTIONS.find(s => s.value === o.status)?.label || o.status || "Chưa đặt";

                    return (
                      <tr key={o.id} className={`border-t hover:bg-slate-50 transition ${rowClass}`}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/orders/${o.id}`}
                            className="font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                          >
                            {o.order_code ?? `#${o.id}`}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {o.main_image_url ? (
                            <img
                              src={o.main_image_url}
                              alt="Hình"
                              className="w-12 h-12 rounded-lg object-cover border cursor-pointer hover:opacity-80 transition"
                              onClick={() => setPreviewImage(o.main_image_url)}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400">
                              No img
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium">{o.customer_name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {o.order_date ? dayjs(o.order_date).format("DD/MM") : "-"}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {o.due_date ? dayjs(o.due_date).format("DD/MM/YYYY") : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {daysLeft !== null && (
                            <span className={`font-medium ${daysLeft < 0 ? "text-rose-600" : daysLeft <= 3 ? "text-amber-600" : "text-emerald-600"}`}>
                              {daysLeft}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700">
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-slate-900/5 text-slate-800">
                            {autoStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <div className="line-clamp-2">{o.items_summary}</div>
                          <div className="mt-1 text-xs font-medium text-slate-500">
                            SL: {o.total_planned} / {o.total_actual}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {o.total_amount ? Number(o.total_amount).toLocaleString("vi-VN") : "-"} đ
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            href={`/orders/${o.id}`}
                            className="text-emerald-600 hover:text-emerald-800 font-medium text-sm"
                          >
                            Xem
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Phân trang */}
          {totalPages > 1 && (
            <div className="border-t border-slate-200 px-4 py-3 bg-slate-50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
                <div className="text-slate-600">
                  Hiển thị <strong>{startIndex}-{endIndex}</strong> trong <strong>{totalCount}</strong> đơn
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {PAGE_SIZES.map(size => (
                      <option key={size} value={size}>{size}/trang</option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                      className="p-2 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <span className="px-3 py-1 font-medium">
                      {page} / {totalPages}
                    </span>

                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-2 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(totalPages)}
                      disabled={page === totalPages}
                      className="p-2 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}