"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { supabase } from "./lib/supabaseClient";

type DashboardStats = {
  customers: number;
  orders: number;
  activeOrders: number;
  overdueOrders: number;
  upcomingOrders: number;
  totalQuantity: number;
  monthRevenue: number;
  yearRevenue: number;
  statusCounts: Record<string, number>;
};

const initialStats: DashboardStats = {
  customers: 0,
  orders: 0,
  activeOrders: 0,
  overdueOrders: 0,
  upcomingOrders: 0,
  totalQuantity: 0,
  monthRevenue: 0,
  yearRevenue: 0,
  statusCounts: {},
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "NEW",
  APPROVED: "APPROVED",
  CUTTING: "Đang cắt",
  SEWING: "Đang may",
  FINISHING: "Hoàn thiện",
  DONE: "Hoàn thành",
  DELIVERED: "Đã giao",
  CANCELLED: "Hủy",
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-500",
  APPROVED: "bg-green-500",
  CUTTING: "bg-indigo-500",
  SEWING: "bg-purple-500",
  FINISHING: "bg-yellow-500",
  DONE: "bg-teal-500",
  DELIVERED: "bg-emerald-500",
  CANCELLED: "bg-red-500",
};

function formatMoney(v: number) {
  return v > 0 ? v.toLocaleString("vi-VN") + " đ" : "0 đ";
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [loading, setLoading] = useState(false);
  const [updateTime, setUpdateTime] = useState<string>("");
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">("month"); // Default to month

  const loadStats = useCallback(async (selectedPeriod: typeof period) => {
    setLoading(true);

    const today = dayjs();
    const todayStr = today.format("YYYY-MM-DD");
    const threeDaysStr = today.add(3, "day").format("YYYY-MM-DD");
    const startOfYearStr = today.startOf("year").format("YYYY-MM-DD");
    const startOfMonthStr = today.startOf("month").format("YYYY-MM-DD");

    let startDate: string;
    switch (selectedPeriod) {
      case "today":
        startDate = today.startOf("day").format("YYYY-MM-DD");
        break;
      case "week":
        startDate = today.subtract(6, "day").format("YYYY-MM-DD"); // 7 days including today
        break;
      case "month":
        startDate = startOfMonthStr;
        break;
      case "year":
        startDate = startOfYearStr;
        break;
      default:
        startDate = startOfMonthStr;
    }

    // 1) Lấy orders
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("id, customer_id, order_date, due_date, status, total_amount")
      .order("order_date", { ascending: false });

    // 2) Lấy order_items (chỉ cần quantity)
    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("order_id, quantity");

    // 3) Đếm customers (luôn tổng, không filter theo period)
    const { count: customersCount, error: customersError } = await supabase
      .from("customers")
      .select("id", { count: "exact" as any, head: true });

    if (ordersError || itemsError || customersError) {
      console.error(ordersError ?? itemsError ?? customersError);
      alert("Lỗi tải thống kê, vui lòng F5 lại.");
      setLoading(false);
      return;
    }

    const allOrders = ordersData ?? [];
    const allItems = itemsData ?? [];

    // Filter orders theo period
    const orders = allOrders.filter((o) => o.order_date >= startDate);

    // Filter items theo orders đã filter
    const orderIds = orders.map((o) => o.id);
    const items = allItems.filter((i) => orderIds.includes(i.order_id));

    // --- Tính toán ---
    const ordersCount = orders.filter(async (o) => {
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("quantity")
        .eq("order_id", o.id);
      const totalPlanned = orderItems?.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0) || 0;
      return totalPlanned > 0;
    }).length;

    let activeOrders = 0; // Giữ current, không filter period
    let overdueOrders = 0;
    let upcomingOrders = 0;
    let monthRevenue = 0;
    let yearRevenue = 0;
    const statusCounts: Record<string, number> = {};

    for (const o of orders) {
      const st = (o.status ?? "NEW") as string;
      statusCounts[st] = (statusCounts[st] ?? 0) + 1;

      // Active, overdue, upcoming chỉ tính cho allOrders (current)
      // Nhưng vì filter orders, ta tính statusCounts và revenue cho filtered orders
    }

    // Tính active/overdue/upcoming từ allOrders (current, không filter)
    for (const o of allOrders) {
      const st = (o.status ?? "NEW") as string;
      const isFinished = st === "DONE" || st === "DELIVERED" || st === "CANCELLED";
      if (!isFinished) activeOrders++;

      if (o.due_date) {
        if (o.due_date < todayStr && !isFinished) overdueOrders++;
        if (o.due_date >= todayStr && o.due_date <= threeDaysStr && !isFinished)
          upcomingOrders++;
      }
    }

    // Revenue từ filtered orders
    for (const o of orders) {
      if (o.total_amount && o.order_date) {
        const amt = Number(o.total_amount) || 0;
        if (o.order_date >= startOfYearStr) yearRevenue += amt;
        if (o.order_date >= startOfMonthStr) monthRevenue += amt;
      }
    }

    const totalQuantity = items.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

    setStats({
      customers: customersCount ?? 0,
      orders: ordersCount,
      activeOrders,
      overdueOrders,
      upcomingOrders,
      totalQuantity,
      monthRevenue,
      yearRevenue,
      statusCounts,
    });

    setUpdateTime(today.format("HH:mm – DD/MM/YYYY"));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats(period);

    let timeout: NodeJS.Timeout;
    const debouncedLoad = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => loadStats(period), 500);
    };

    const channel = supabase
      .channel("dashboard_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        debouncedLoad
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        debouncedLoad
      )
      .subscribe();

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [loadStats, period]);

  const totalOrders = Object.values(stats.statusCounts).reduce((sum, v) => sum + v, 0) || 1;
  const maxStatusCount = Object.values(stats.statusCounts).reduce((max, v) => (v > max ? v : max), 0) || 1;

  const deliveredCount = (stats.statusCounts.DONE || 0) + (stats.statusCounts.DELIVERED || 0);
  const deliveredPercent = ((deliveredCount / totalOrders) * 100).toFixed(1);
  const processingCount = stats.activeOrders; // Đang xử lý = activeOrders
  const cancelledCount = stats.statusCounts.CANCELLED || 0;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Dashboard xưởng may</h1>
            <p className="text-xs text-slate-500">Tổng quan khách hàng, đơn hàng và sản lượng.</p>
          </div>
          <span className="rounded-full bg-slate-900 text-white text-xs px-3 py-1">Nội bộ Arden</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Tổng quan hôm nay</h2>
              <p className="text-xs text-slate-500">Cập nhật lúc {updateTime}</p>
            </div>
            <div className="flex items-center gap-2">
              {loading && <span className="text-xs text-slate-500">Đang cập nhật số liệu...</span>}
              <button
                onClick={() => loadStats(period)}
                disabled={loading}
                className="text-xs text-blue-600 hover:text-blue-700 underline disabled:opacity-50"
              >
                Tải lại
              </button>
            </div>
          </div>

          {/* Filter thời gian */}
          <div className="flex gap-2">
            <button
              onClick={() => setPeriod("today")}
              className={`text-xs px-3 py-1 rounded-full ${period === "today" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-900"}`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setPeriod("week")}
              className={`text-xs px-3 py-1 rounded-full ${period === "week" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-900"}`}
            >
              7 ngày
            </button>
            <button
              onClick={() => setPeriod("month")}
              className={`text-xs px-3 py-1 rounded-full ${period === "month" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-900"}`}
            >
              Tháng này
            </button>
            <button
              onClick={() => setPeriod("year")}
              className={`text-xs px-3 py-1 rounded-full ${period === "year" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-900"}`}
            >
              Năm nay
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/customers" className="block hover:shadow-md transition-shadow">
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Khách hàng</p>
                <p className="text-2xl font-bold mt-1">{stats.customers}</p>
                <p className="text-xs text-slate-400 mt-1">Brand / khách sỉ / khách lẻ đã lưu.</p>
              </div>
            </Link>

            <Link href="/orders" className="block hover:shadow-md transition-shadow">
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Tổng đơn hàng</p>
                <p className="text-2xl font-bold mt-1">{stats.orders}</p>
                <p className="text-xs text-slate-400 mt-1">Toàn bộ đơn đã tạo trong hệ thống.</p>
              </div>
            </Link>

            <Link href="/orders?status=processing" className="block hover:shadow-md transition-shadow">
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Đơn đang xử lý</p>
                <p className="text-2xl font-bold mt-1">{stats.activeOrders}</p>
                <p className="text-xs text-slate-400 mt-1">Chưa DONE / DELIVERED / CANCELLED.</p>
              </div>
            </Link>

            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Tổng số lượng (SP)</p>
              <p className="text-2xl font-bold mt-1">{stats.totalQuantity.toLocaleString("vi-VN")}</p>
              <p className="text-xs text-slate-400 mt-1">Tổng sản phẩm trong tất cả đơn.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Doanh thu tháng {dayjs().format("MM/YYYY")}</p>
              <p className="text-xl font-bold mt-1">{formatMoney(stats.monthRevenue)}</p>
              <p className="text-xs text-slate-400 mt-1">Tính theo ngày đặt đơn.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Doanh thu từ đầu năm {dayjs().format("YYYY")}</p>
              <p className="text-xl font-bold mt-1">{formatMoney(stats.yearRevenue)}</p>
              <p className="text-xs text-slate-400 mt-1">Giúp bạn xem nhanh kết quả năm nay.</p>
            </div>

            <Link href="/orders?deadline=upcoming" className="block hover:shadow-md transition-shadow">
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Cảnh báo deadline</p>
                <div className="mt-2 space-y-1 text-xs">
                  <p>
                    <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-2" />
                    Đơn đã trễ: <span className="font-semibold">{stats.overdueOrders}</span> ⚠️
                  </p>
                  <p>
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-2" />
                    Đơn còn ≤ 3 ngày giao: <span className="font-semibold">{stats.upcomingOrders}</span>
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm lg:col-span-2">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold">Phân bố đơn theo trạng thái</h2>
              <span className="text-[11px] text-slate-400">Thanh ngang = số lượng đơn từng trạng thái</span>
            </div>

            <div className="space-y-2">
              {Object.keys(stats.statusCounts).length === 0 && (
                <p className="text-xs text-slate-400">Chưa có đơn hàng nào để hiển thị.</p>
              )}

              {Object.entries(stats.statusCounts).map(([status, count]) => {
                const label = STATUS_LABELS[status] ?? status;
                const percent = ((count / totalOrders) * 100).toFixed(1);
                const widthPercent = (count / maxStatusCount) * 100;

                return (
                  <div key={status}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span>{label}</span>
                      <span className="text-slate-500">{count} đơn</span>
                    </div>
                    <div
                      className="h-2 bg-slate-100 rounded-full overflow-hidden"
                      title={`${count} (${percent}%)`}
                    >
                      <div
                        className={`h-full ${STATUS_COLORS[status] || "bg-slate-900"} rounded-full`}
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dòng tóm tắt */}
            <p className="text-xs text-slate-500 mt-4">
              Tổng đơn: {totalOrders} | Đã giao: {deliveredCount} ({deliveredPercent}%) | Đang xử lý: {processingCount} | Đã huỷ: {cancelledCount}
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Chức năng nhanh</h2>
            <div className="grid grid-cols-1 gap-3">
              <Link
                href="/customers"
                className="group bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col justify-between hover:border-slate-400 hover:shadow-md transition-all"
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">Quản lý khách hàng</h3>
                  <p className="text-xs text-slate-500">Thêm / sửa / xem danh sách brand và khách lẻ.</p>
                </div>
                <div className="mt-3 text-xs font-medium text-slate-700 group-hover:text-slate-900">
                  Mở danh sách khách hàng
                </div>
              </Link>

              <Link
                href="/orders"
                className="group bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col justify-between hover:border-slate-400 hover:shadow-md transition-all"
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">Danh sách đơn đặt may</h3>
                  <p className="text-xs text-slate-500">Xem deadline, trạng thái và tổng tiền từng đơn.</p>
                </div>
                <div className="mt-3 text-xs font-medium text-slate-700 group-hover:text-slate-900">
                  Xem tất cả đơn
                </div>
              </Link>

              <Link
                href="/orders/new"
                className="group bg-slate-900 text-white rounded-2xl shadow-sm p-4 flex flex-col justify-between hover:bg-slate-800 transition-all"
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Tạo đơn đặt may mới</h3>
                  <p className="text-xs text-slate-200/90">Chọn khách hàng, nhập sản phẩm, số lượng, ngày giao.</p>
                </div>
                <div className="mt-3 text-xs font-medium">Bắt đầu tạo đơn</div>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}