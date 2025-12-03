"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Package,
  Calendar,
  Filter,
  X,
  Upload,
  Download,
  Users,
  Check,
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
  total_amount: number | null;
  final_amount: number | null;
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

function formatDaysLeft(
  daysLeft: number | null
): { text: string; colorClass: string } {
  if (daysLeft === null) return { text: "-", colorClass: "text-slate-500" };
  if (daysLeft > 7)
    return { text: `Còn ${daysLeft} ngày`, colorClass: "text-emerald-600" };
  if (daysLeft > 3)
    return { text: `Còn ${daysLeft} ngày`, colorClass: "text-amber-600" };
  if (daysLeft > 0)
    return { text: `Còn ${daysLeft} ngày`, colorClass: "text-orange-600" };
  if (daysLeft === 0) return { text: "Hôm nay", colorClass: "text-red-600" };
  return { text: `Trễ ${Math.abs(daysLeft)} ngày`, colorClass: "text-red-600" };
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

function isAutoReminderEnabled(autoStatus: string): boolean {
  return ["SẮP ĐẾN HẠN", "QUÁ HẠN", "HẠN GIAO HÔM NAY"].includes(autoStatus);
}

function getRowClass(autoStatus: string) {
  if (autoStatus === "HOÀN THÀNH" || autoStatus === "ĐÃ GIAO")
    return "bg-emerald-50/70";
  if (autoStatus === "QUÁ HẠN") return "bg-rose-50/70";
  if (autoStatus === "SẮP ĐẾN HẠN" || autoStatus === "HẠN GIAO HÔM NAY")
    return "bg-amber-50/70";
  return "bg-white";
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newBulkStatus, setNewBulkStatus] = useState("");

  // Export theo khách
  const [showCustomerExport, setShowCustomerExport] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  // Bộ lọc
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");

  // Phân trang
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

  const loadOrders = async () => {
    setLoading(true);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

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
      final_amount,
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
      .range(from, to)
      .order("due_date", { ascending: true, nullsFirst: true });

    if (statusFilter) query = query.eq("status", statusFilter);
    if (customerFilter) query = query.eq("customer_id", +customerFilter);
    if (orderDateFrom) query = query.gte("order_date", orderDateFrom);
    if (orderDateTo) query = query.lte("order_date", orderDateTo);
    if (dueDateFrom) query = query.gte("due_date", dueDateFrom);
    if (dueDateTo) query = query.lte("due_date", dueDateTo);

    const { data, error, count } = await query;

    if (error) {
      console.error(error);
      alert("Lỗi tải danh sách: " + error.message);
      setOrders([]);
      setTotalCount(0);
    } else {
      const rows: OrderRow[] =
        data?.map((row: any) => {
          const items = row.order_items || [];
          const itemsSummary = items
            .map(
              (it: any) =>
                `${it.product_name} (${it.quantity}/${it.actual_quantity ?? "-"
                }) @ ${it.unit_price?.toLocaleString("vi-VN") ?? "-"
                } đ`
            )
            .join(", ");

          const totalPlanned = items.reduce(
            (sum: number, it: any) => sum + (it.quantity || 0),
            0
          );
          const totalActual = items.reduce(
            (sum: number, it: any) => sum + (it.actual_quantity || 0),
            0
          );

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
            final_amount: row.final_amount,
            customer_name: row.customers?.name ?? null,
            main_image_url: row.main_image_url,
            items_summary: itemsSummary || "Chưa có items",
            total_planned: totalPlanned,
            total_actual: totalActual,
          };
        }) ?? [];

      // setOrders(rows.filter((o) => o.total_planned > 0));
      setOrders(rows)
      // hoặc nếu muốn hiển thị nhưng đánh dấu:
rows.map(order => ({
   ...order,
   _hasNoItems: order.total_planned === 0
}));
      setTotalCount(count ?? 0);
    }

    setLoading(false);
  };

  // Khi các bộ lọc hoặc pageSize thay đổi → reset về trang 1
  useEffect(() => {
    setPage(1);
  }, [statusFilter, customerFilter, orderDateFrom, orderDateTo, dueDateFrom, dueDateTo, pageSize]);

  // Load dữ liệu mỗi khi filter, page hoặc pageSize thay đổi
  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, customerFilter, orderDateFrom, orderDateTo, dueDateFrom, dueDateTo, page, pageSize]);

  // Debounce search
  useEffect(() => {
    const delay = setTimeout(() => {
      setPage(1);
      loadOrders();
    }, 500);
    return () => clearTimeout(delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Lọc client-side cho search
  const filteredOrders = orders.filter((o) => {
    if (!search.trim()) return true;
    const keyword = search.toLowerCase();
    return (
      (o.order_code || `#${o.id}`)?.toLowerCase().includes(keyword) ||
      (o.customer_name || "").toLowerCase().includes(keyword) ||
      (o.items_summary || "").toLowerCase().includes(keyword)
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

  // Bulk select
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredOrders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredOrders.map((o) => o.id));
    }
  };

  const updateBulkStatus = async () => {
    if (!newBulkStatus || selectedIds.length === 0) return;
    const { error } = await supabase
      .from("orders")
      .update({ status: newBulkStatus })
      .in("id", selectedIds);
    if (error) {
      alert("Lỗi cập nhật: " + error.message);
    } else {
      alert("Cập nhật thành công!");
      setSelectedIds([]);
      setNewBulkStatus("");
      loadOrders();
    }
  };

  // --- Export: giữ nguyên logic cũ, chỉ rút gọn phần UI ---
  const exportSelectedOrders = async () => {
    if (selectedIds.length === 0) return;

    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_code,
        order_date,
        due_date,
        actual_delivery_date,
        status,
        total_amount,
        order_items (
          product_name,
          color,
          size,
          quantity,
          actual_quantity,
          unit_price
        )
      `
      )
      .in("id", selectedIds)
      .order("order_date", { ascending: false });

    if (error) {
      alert("Lỗi tải dữ liệu: " + error.message);
      return;
    }

    if (!orders || orders.length === 0) {
      alert("Không có đơn hàng được chọn.");
      return;
    }

    const orderRows = orders.map((o: any) => ({
      "Mã đơn": o.order_code || `#${o.id}`,
      "Ngày đặt": o.order_date ? dayjs(o.order_date).format("DD/MM/YYYY") : "",
      "Hạn giao": o.due_date ? dayjs(o.due_date).format("DD/MM/YYYY") : "",
      "Ngày giao thực tế": o.actual_delivery_date
        ? dayjs(o.actual_delivery_date).format("DD/MM/YYYY")
        : "",
      "Trạng thái":
        STATUS_OPTIONS.find((s) => s.value === o.status)?.label || o.status,
      "Tổng tiền": o.total_amount
        ? Number(o.total_amount).toLocaleString("vi-VN") + " đ"
        : "",
    }));

    const itemRows: any[] = [];
    orders.forEach((o: any) => {
      const items = o.order_items || [];
      items.forEach((it: any) => {
        itemRows.push({
          "Mã đơn": o.order_code || `#${o.id}`,
          "Sản phẩm": it.product_name,
          "Màu": it.color || "",
          Size: it.size || "",
          "SL đặt": it.quantity,
          "SL thực": it.actual_quantity ?? "",
          "Đơn giá": it.unit_price
            ? Number(it.unit_price).toLocaleString("vi-VN") + " đ"
            : "",
          "Thành tiền":
            it.unit_price && it.actual_quantity
              ? (it.unit_price * it.actual_quantity).toLocaleString("vi-VN") +
              " đ"
              : "",
        });
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(orderRows),
      "Danh sách đơn hàng"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(itemRows),
      "Chi tiết sản phẩm"
    );

    const fileName = `Don_hang_selected_${dayjs().format("YYYYMMDD")}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const exportCustomerOrders = async (customer: Customer) => {
    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        `
      id,
      order_code,
      order_date,
      due_date,
      actual_delivery_date,
      status,
      total_amount,
      order_items (
        product_name,
        color,
        size,
        quantity,
        actual_quantity,
        unit_price
      )
    `
      )
      .eq("customer_id", customer.id)
      .order("order_date", { ascending: false });

    if (error) {
      alert("Lỗi tải dữ liệu: " + error.message);
      return;
    }

    if (!orders || orders.length === 0) {
      alert(`Khách ${customer.name} chưa có đơn hàng nào.`);
      return;
    }

    const orderRows = orders.map((o: any) => ({
      "Mã đơn": o.order_code || `#${o.id}`,
      "Ngày đặt": o.order_date ? dayjs(o.order_date).format("DD/MM/YYYY") : "",
      "Hạn giao": o.due_date ? dayjs(o.due_date).format("DD/MM/YYYY") : "",
      "Ngày giao thực tế": o.actual_delivery_date
        ? dayjs(o.actual_delivery_date).format("DD/MM/YYYY")
        : "",
      "Trạng thái":
        STATUS_OPTIONS.find((s) => s.value === o.status)?.label || o.status,
      "Tổng tiền": o.total_amount
        ? Number(o.total_amount).toLocaleString("vi-VN") + " đ"
        : "",
    }));

    const itemRows: any[] = [];
    orders.forEach((o: any) => {
      const items = o.order_items || [];
      items.forEach((it: any) => {
        itemRows.push({
          "Mã đơn": o.order_code || `#${o.id}`,
          "Sản phẩm": it.product_name,
          "Màu": it.color || "",
          Size: it.size || "",
          "SL đặt": it.quantity,
          "SL thực": it.actual_quantity ?? "",
          "Đơn giá": it.unit_price
            ? Number(it.unit_price).toLocaleString("vi-VN") + " đ"
            : "",
          "Thành tiền":
            it.unit_price && it.actual_quantity
              ? (it.unit_price * it.actual_quantity).toLocaleString("vi-VN") +
              " đ"
              : "",
        });
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(orderRows),
      "Danh sách đơn hàng"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(itemRows),
      "Chi tiết sản phẩm"
    );

    const fileName = `Don_hang_${customer.name.replace(
      /[^a-zA-Z0-9]/g,
      "_"
    )}_${dayjs().format("YYYYMMDD")}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const exportOrdersToCsv = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_code,
        order_date,
        due_date,
        status,
        total_amount,
        customers ( name )
      `
      )
      .order("order_date", { ascending: true });

    if (error) {
      alert("Lỗi: " + error.message);
      return;
    }

    const header = [
      "ID",
      "Ma_don",
      "Ten_khach_hang",
      "Ngay_dat",
      "Ngay_giao_du_kien",
      "Trang_thai",
      "Tong_tien",
    ];
    const lines = [header.join(",")];

    for (const row of (data || []) as any[]) {
      const line = [
        row.id,
        row.order_code ?? "",
        row.customers?.name ?? "",
        row.order_date ?? "",
        row.due_date ?? "",
        row.status ?? "",
        row.total_amount ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
      lines.push(line);
    }

    const csvContent = lines.join("\r\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters =
    statusFilter ||
    customerFilter ||
    orderDateFrom ||
    orderDateTo ||
    dueDateFrom ||
    dueDateTo;

  // Một ít số liệu tổng quan cho header
  const totalOverdue = filteredOrders.filter((o) => {
    const d = getDaysLeft(o.due_date);
    return d !== null && d < 0;
  }).length;

  const totalInProgress = filteredOrders.filter(
    (o) => o.status && !["DELIVERED", "DONE", "CANCELLED"].includes(o.status)
  ).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Modal preview hình */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}

      {/* Header */}
      <header className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Package className="w-5 h-5" />
                </span>
                Đơn đặt may
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Quản lý toàn bộ đơn hàng, tiến độ & hạn giao của xưởng.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 border border-amber-200">
                  <span className="text-xs sm:text-sm font-medium text-amber-900">
                    Đã chọn{" "}
                    <span className="font-semibold">{selectedIds.length}</span>{" "}
                    đơn
                  </span>
                  <select
                    value={newBulkStatus}
                    onChange={(e) => setNewBulkStatus(e.target.value)}
                    className="px-2 py-1 border border-amber-200 rounded-lg text-xs bg-white"
                  >
                    <option value="">Trạng thái mới</option>
                    {STATUS_OPTIONS.filter((s) => s.value).map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={updateBulkStatus}
                    disabled={!newBulkStatus}
                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-600 text-white shadow-sm disabled:opacity-50"
                  >
                    Cập nhật
                  </button>
                  <button
                    onClick={exportSelectedOrders}
                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-sky-600 text-white shadow-sm"
                  >
                    Xuất Excel
                  </button>
                  <button
                    onClick={() => setSelectedIds([])}
                    className="p-1 text-rose-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowCustomerExport(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
              >
                <Users className="w-4 h-4" />
                Excel theo khách
              </button>

              <button
                onClick={exportOrdersToCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>

              <Link
                href="/orders/import"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
              >
                <Upload className="w-4 h-4" />
                Import Excel
              </Link>

              <Link
                href="/"
                className="hidden sm:inline-flex px-3 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
              >
                Trang chủ
              </Link>

              <Link
                href="/orders/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs sm:text-sm font-semibold shadow-sm hover:bg-emerald-700"
              >
                + Tạo đơn mới
              </Link>
            </div>
          </div>

          {/* Summary nhỏ */}
          <div className="grid grid-cols-3 gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
              <span className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs">
                {totalCount}
              </span>
              <div className="flex flex-col">
                <span className="font-semibold text-slate-800">Tổng đơn</span>
                <span className="text-slate-500 text-[11px]">
                  Tính theo bộ lọc hiện tại
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
              <span className="h-6 w-6 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 text-xs">
                {totalOverdue}
              </span>
              <div className="flex flex-col">
                <span className="font-semibold text-rose-700">Đơn trễ</span>
                <span className="text-rose-500 text-[11px]">
                  Cần ưu tiên xử lý
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
              <span className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs">
                {totalInProgress}
              </span>
              <div className="flex flex-col">
                <span className="font-semibold text-emerald-700">
                  Đang sản xuất
                </span>
                <span className="text-emerald-500 text-[11px]">
                  Cắt / may / hoàn thiện
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Popup chọn khách Excel */}
      {showCustomerExport && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Xuất Excel theo khách</h3>
              <button
                onClick={() => setShowCustomerExport(false)}
                className="text-slate-500 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Tìm tên / mã khách..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-xl mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />

            <div className="max-h-80 overflow-y-auto space-y-1">
              {customers
                .filter(
                  (c) =>
                    c.name
                      .toLowerCase()
                      .includes(customerSearch.toLowerCase()) ||
                    (c.code &&
                      c.code
                        .toLowerCase()
                        .includes(customerSearch.toLowerCase()))
                )
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      exportCustomerOrders(c);
                      setShowCustomerExport(false);
                      setCustomerSearch("");
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg hover:bg-emerald-50 transition flex items-center justify-between text-sm"
                  >
                    <span className="font-medium text-slate-800">
                      {c.code ? `${c.code} – ${c.name}` : c.name}
                    </span>
                  </button>
                ))}
              {customers.filter((c) =>
                c.name.toLowerCase().includes(customerSearch.toLowerCase())
              ).length === 0 && (
                  <p className="text-center text-slate-500 py-8 text-sm">
                    Không tìm thấy khách hàng
                  </p>
                )}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Bộ lọc */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-sm sm:text-base font-semibold flex items-center gap-2 text-slate-800">
              <Filter className="w-4 h-4 text-emerald-600" />
              Bộ lọc & tìm kiếm
            </h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs sm:text-sm text-rose-600 hover:text-rose-700 inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Xoá tất cả
              </button>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Tìm kiếm (mã, khách, sản phẩm)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Nhập mã đơn, tên khách, sản phẩm..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <Package className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Trạng thái
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Khách hàng
              </label>
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="">Tất cả khách</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} – ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Ngày đặt từ
              </label>
              <input
                type="date"
                value={orderDateFrom}
                onChange={(e) => setOrderDateFrom(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Ngày đặt đến
              </label>
              <input
                type="date"
                value={orderDateTo}
                onChange={(e) => setOrderDateTo(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Hạn giao từ
              </label>
              <input
                type="date"
                value={dueDateFrom}
                onChange={(e) => setDueDateFrom(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Hạn giao đến
              </label>
              <input
                type="date"
                value={dueDateTo}
                onChange={(e) => setDueDateTo(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Bảng + phân trang */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b">
                <tr className="text-slate-600">
                  <th className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.length === filteredOrders.length &&
                        filteredOrders.length > 0
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-medium">Mã đơn</th>
                  <th className="px-3 py-3 text-left font-medium">Hình</th>
                  <th className="px-3 py-3 text-left font-medium">Khách</th>
                  <th className="px-3 py-3 text-left font-medium">Ngày đặt</th>
                  <th className="px-3 py-3 text-left font-medium">Hạn giao</th>
                  <th className="px-3 py-3 text-right font-medium">Còn</th>
                  <th className="px-3 py-3 text-left font-medium">
                    Trạng thái
                  </th>
                  <th className="px-3 py-3 text-left font-medium">Tự động</th>
                  <th className="px-3 py-3 text-left font-medium">Sản phẩm</th>
                  <th className="px-3 py-3 text-right font-medium">Tổng</th>
                  <th className="px-3 py-3 text-right font-medium">
                    Cuối cùng
                  </th>
                  <th className="px-3 py-3 text-center font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
                      </div>
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      <Package className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                      <p>Không có đơn hàng phù hợp.</p>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => {
                    const daysLeft = getDaysLeft(o.due_date);
                    const { text: daysText, colorClass } =
                      formatDaysLeft(daysLeft);
                    const autoStatus = buildAutoStatus(
                      o.due_date,
                      o.actual_delivery_date,
                      o.status
                    );
                    const rowClass = getRowClass(autoStatus);
                    const statusLabel =
                      STATUS_OPTIONS.find((s) => s.value === o.status)
                        ?.label ||
                      o.status ||
                      "Chưa đặt";
                    const autoReminder = isAutoReminderEnabled(autoStatus);

                    return (
                      <tr
                        key={o.id}
                        className={`${rowClass} border-t border-slate-100 hover:bg-slate-50/80 transition cursor-pointer`}
                        onClick={() => router.push(`/orders/${o.id}`)}
                      >
                        <td
                          className="px-3 py-3 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(o.id)}
                            onChange={() => toggleSelect(o.id)}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            href={`/orders/${o.id}`}
                            className="font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {o.order_code ?? `#${o.id}`}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          {o.main_image_url ? (
                            <img
                              src={o.main_image_url}
                              alt="Hình"
                              className="w-11 h-11 rounded-lg object-cover border border-slate-200 cursor-pointer hover:opacity-80"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImage(o.main_image_url!);
                              }}
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-400">
                              No img
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-800">
                          {o.customer_name}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {o.order_date
                            ? dayjs(o.order_date).format("DD/MM")
                            : "-"}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700">
                          {o.due_date
                            ? dayjs(o.due_date).format("DD/MM/YYYY")
                            : "-"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className={`font-semibold ${colorClass}`}>
                            {daysText}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium bg-slate-900/5 text-slate-800 border border-slate-100">
                            {autoStatus}
                            {autoReminder && (
                              <Check className="w-3 h-3 ml-1 text-emerald-600" />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[11px] sm:text-xs text-slate-600 max-w-xs">
                          <div className="line-clamp-2">{o.items_summary}</div>
                          <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                            SL: {o.total_planned} / {o.total_actual}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                          {o.total_amount
                            ? Number(o.total_amount).toLocaleString("vi-VN")
                            : "-"}{" "}
                          đ
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                          {o.final_amount
                            ? Number(o.final_amount).toLocaleString("vi-VN")
                            : "-"}{" "}
                          đ
                        </td>
                        <td
                          className="px-3 py-3 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/orders/${o.id}`}
                            className="inline-flex items-center text-xs font-medium text-emerald-700 hover:text-emerald-900"
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs sm:text-sm">
                <div className="text-slate-600">
                  Hiển thị{" "}
                  <span className="font-semibold">
                    {startIndex}-{endIndex}
                  </span>{" "}
                  trong{" "}
                  <span className="font-semibold">{totalCount}</span> đơn
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}/trang
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                      className="p-1.5 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-medium">
                      {page} / {totalPages || 1}
                    </span>

                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="p-1.5 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(totalPages)}
                      disabled={page === totalPages}
                      className="p-1.5 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
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
