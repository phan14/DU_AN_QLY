"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import dayjs from "dayjs";

type Order = {
  id: number;
  order_code: string | null;
  order_date: string | null;
  due_date: string | null;
  status: string | null;
  note: string | null;
  total_amount: number | null;
  main_image_url: string | null;

  customers: {
    name: string;
    code: string | null;
  } | null;
};

type OrderItem = {
  id: number;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unit_price: number | null;
  actual_quantity: number | null;
};

type ItemState = OrderItem & {
  actual_quantity_input: string; // để bind input
};

const STATUS_OPTIONS = [
  { value: "NEW", label: "Mới tạo" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "CUTTING", label: "Đang cắt" },
  { value: "SEWING", label: "Đang may" },
  { value: "FINISHING", label: "Hoàn thiện" },
  { value: "DONE", label: "Hoàn thành (chờ giao)" },
  { value: "DELIVERED", label: "Đã giao" },
  { value: "CANCELLED", label: "Đã huỷ" },
];

function formatMoney(v: number | null | undefined) {
  if (!v || isNaN(v)) return "";
  return v.toLocaleString("vi-VN") + " đ";
}

export default function OrderDetailPage() {
  // 👇 kiểu cho useParams để TS đỡ báo lỗi
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = Number(params.id);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [savingImage, setSavingImage] = useState(false);

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<ItemState[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingActual, setSavingActual] = useState(false);

  // tải dữ liệu đơn + items
  useEffect(() => {
    const loadData = async () => {
      if (Number.isNaN(orderId)) return;

      setLoading(true);

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(
          `
          id,
          order_code,
          order_date,
          due_date,
          status,
          note,
          total_amount,
          main_image_url,
          customers (
            name,
            code
          )
        `
        )
        .eq("id", orderId)
        .single();

      if (orderError) {
        console.error(orderError);
        alert("Lỗi tải đơn hàng: " + orderError.message);
        setLoading(false);
        return;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select(
          "id, product_name, color, size, quantity, unit_price, actual_quantity"
        )
        .eq("order_id", orderId)
        .order("id", { ascending: true });

      if (itemsError) {
        console.error(itemsError);
        alert("Lỗi tải chi tiết sản phẩm: " + itemsError.message);
        setLoading(false);
        return;
      }

      setOrder(orderData as unknown as Order);

      const mapped: ItemState[] = (itemsData as OrderItem[]).map((it) => ({
        ...it,
        actual_quantity_input:
          it.actual_quantity != null ? String(it.actual_quantity) : "",
      }));
      setItems(mapped);

      setLoading(false);
    };

    loadData();
  }, [orderId]);

  const handleStatusChange = async (status: string) => {
    if (!order) return;
    setSavingStatus(true);

    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", order.id);

    if (error) {
      alert("Lỗi cập nhật trạng thái: " + error.message);
    } else {
      setOrder({ ...order, status });
    }
    setSavingStatus(false);
  };

  const handleActualChange = (itemId: number, value: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, actual_quantity_input: value } : it
      )
    );
  };

  const deleteItem = async (itemId: number) => {
    if (!confirm("Bạn có chắc muốn xóa sản phẩm này?")) return;

    const { error } = await supabase
      .from("order_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      alert("Lỗi xóa sản phẩm: " + error.message);
      return;
    }

    // Xóa khỏi UI ngay không cần load lại
    setItems((prev) => prev.filter((it) => it.id !== itemId));

    alert("Đã xóa sản phẩm.");
  };

  const handleSaveActualQuantities = async () => {
    setSavingActual(true);

    try {
      const updatedItems = items.map((it) => {
        const trimmed = it.actual_quantity_input.trim();
        const cleaned = trimmed.replace(/\./g, "").replace(",", ".");
        const num = trimmed === "" ? null : Number(cleaned);

        if (trimmed !== "" && (isNaN(num as number) || (num as number) < 0)) {
          throw new Error(
            "SL thực tế không hợp lệ ở sản phẩm: " + it.product_name
          );
        }

        return { ...it, actual_quantity: num };
      });

      for (const it of updatedItems) {
        const { error } = await supabase
          .from("order_items")
          .update({
            actual_quantity: it.actual_quantity,
          })
          .eq("id", it.id);

        if (error) {
          throw new Error(
            `Lỗi cập nhật SL thực tế cho sản phẩm ${it.product_name}: ${error.message}`
          );
        }
      }

      // Cập nhật state với actual_quantity mới và input đồng bộ (không format thousand sep ở input để dễ edit)
      setItems(
        updatedItems.map((it) => ({
          ...it,
          actual_quantity_input:
            it.actual_quantity != null ? String(it.actual_quantity) : "",
        }))
      );

      alert("Đã lưu SL thực tế cho tất cả dòng.");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Lỗi lưu SL thực tế");
    } finally {
      setSavingActual(false);
    }
  };

  const totalPlanned = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0),
    0
  );
  const totalActual = items.reduce(
    (sum, it) => {
      const trimmed = it.actual_quantity_input.trim();
      if (trimmed === "") return sum;
      const cleaned = trimmed.replace(/\./g, "").replace(",", ".");
      return sum + (Number(cleaned) || 0);
    },
    0
  );

  const diff = totalActual - totalPlanned;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-600">
        Đang tải đơn hàng...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-slate-600">
          Không tìm thấy đơn hàng #{orderId}.
        </p>
        <Link
          href="/orders"
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs hover:bg-slate-800"
        >
          ← Về danh sách đơn
        </Link>
      </div>
    );
  }

  const handleUploadImage = async () => {
    if (!order) return;
    if (!imageFile) {
      alert("Vui lòng chọn hình trước.");
      return;
    }

    try {
      setSavingImage(true);

      const ext = imageFile.name.split(".").pop();
      const fileName = `order_${order.id}_${Date.now()}.${ext}`;
      const filePath = `orders/${fileName}`;

      // 1) Upload lên Storage
      const { error: uploadError } = await supabase.storage
        .from("order-images")
        .upload(filePath, imageFile, { upsert: true });

      if (uploadError) {
        console.error(uploadError);
        alert("Lỗi upload hình: " + uploadError.message);
        return;
      }

      // 2) Lấy public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("order-images").getPublicUrl(filePath);

      // 3) Lưu vào cột main_image_url của orders
      const { error: updateError } = await supabase
        .from("orders")
        .update({ main_image_url: publicUrl })
        .eq("id", order.id);

      if (updateError) {
        console.error(updateError);
        alert("Lỗi cập nhật link hình: " + updateError.message);
        return;
      }

      // 4) Cập nhật UI
      setOrder({ ...order, main_image_url: publicUrl });
      setImageFile(null);
      alert("Cập nhật hình đại diện đơn hàng thành công!");
    } finally {
      setSavingImage(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* HEADER */}
      <header className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">
              ĐƠN ĐẶT MAY
            </p>
            <h1 className="text-lg font-bold">
              Đơn #{order.order_code || order.id}
            </h1>
            <p className="text-xs text-slate-500">
              Khách:{" "}
              <span className="font-medium">
                {order.customers?.code
                  ? `${order.customers.code} – ${order.customers.name}`
                  : order.customers?.name}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Hình đại diện đơn */}
            <div className="hidden sm:block">
              {order.main_image_url ? (
                <img
                  src={order.main_image_url}
                  alt="Hình đơn hàng"
                  className="w-20 h-20 object-cover rounded-xl border border-slate-200"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-[11px] text-slate-400">
                  Chưa có hình
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <input
                type="file"
                accept="image/*"
                className="text-[11px]"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
              <button
                onClick={handleUploadImage}
                disabled={!imageFile || savingImage}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-[11px] text-slate-700 bg-slate-50 hover:bg-slate-100 disabled:opacity-60"
              >
                {savingImage ? "Đang lưu..." : "Lưu hình đơn hàng"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Link
              href="/orders"
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100"
            >
              ← Danh sách đơn
            </Link>
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100"
            >
              Trang chủ
            </Link>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Thông tin chung + trạng thái */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 text-xs space-y-2">
            <div className="flex gap-6">
              <div>
                <p className="text-slate-500">Ngày đặt</p>
                <p className="font-medium">
                  {order.order_date
                    ? dayjs(order.order_date).format("DD/MM/YYYY")
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Ngày giao dự kiến</p>
                <p className="font-medium">
                  {order.due_date
                    ? dayjs(order.due_date).format("DD/MM/YYYY")
                    : "-"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-slate-500">Ghi chú</p>
              <p className="text-slate-700">
                {order.note || (
                  <span className="text-slate-400">Không có</span>
                )}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-xs space-y-3">
            <div>
              <p className="text-slate-500">Trạng thái đơn</p>
              <select
                className="mt-1 w-full border rounded-lg px-2 py-1 text-xs"
                value={order.status || "NEW"}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={savingStatus}
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-slate-500">Tổng tiền</p>
              <p className="font-semibold">
                {formatMoney(order.total_amount)}
              </p>
            </div>
          </div>
        </section>

        {/* Bảng chi tiết + SL thực tế */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">
                Chi tiết sản phẩm & SL thực tế
              </h2>
              <p className="text-[11px] text-slate-500">
                Hiện tại chỉ sửa SL thực tế, không thay SL đặt.
              </p>
            </div>
            <button
              onClick={handleSaveActualQuantities}
              disabled={savingActual}
              className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs hover:bg-slate-800 disabled:opacity-60"
            >
              {savingActual ? "Đang lưu..." : "Lưu SL thực tế"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs table-fixed">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-2 border-b w-8 text-center">#</th>
                  <th className="px-2 py-2 border-b text-left w-40">
                    Sản phẩm
                  </th>
                  <th className="px-2 py-2 border-b text-left w-20">Màu</th>
                  <th className="px-2 py-2 border-b text-left w-20">Size</th>
                  <th className="px-2 py-2 border-b text-right w-20">
                    SL đặt
                  </th>
                  <th className="px-2 py-2 border-b text-right w-24">
                    SL thực tế
                  </th>
                  <th className="px-2 py-2 border-b text-right w-24">
                    Chênh lệch
                  </th>
                  <th className="px-2 py-2 border-b text-right w-28">
                    Đơn giá
                  </th>
                  <th className="px-2 py-2 border-b text-right w-32">
                    Thành tiền (đặt)
                  </th>
                  <th className="px-2 py-2 border-b text-center w-20">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-5 text-center text-slate-400"
                    >
                      Đơn hàng chưa có dòng sản phẩm nào.
                    </td>
                  </tr>
                )}

                {items.map((it, idx) => {
                  const planned = Number(it.quantity) || 0;
                  const trimmed = it.actual_quantity_input.trim();
                  const cleaned = trimmed.replace(/\./g, "").replace(",", ".");
                  const actual =
                    trimmed === "" ? 0 : Number(cleaned) || 0;
                  const diffRow = actual - planned;
                  const unitPrice = Number(it.unit_price) || 0;
                  const lineTotal = planned * unitPrice;

                  return (
                    <tr
                      key={it.id}
                      className="border-t border-slate-100 hover:bg-slate-50/70"
                    >
                      <td className="px-2 py-1.5 text-center text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{it.product_name}</div>
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">
                        {it.color}
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">
                        {it.size}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {planned.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          className="w-full border rounded px-1 py-0.5 text-right"
                          value={it.actual_quantity_input}
                          onChange={(e) =>
                            handleActualChange(it.id, e.target.value)
                          }
                          placeholder="-"
                        />
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right ${diffRow === 0
                          ? "text-slate-500"
                          : diffRow > 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                          }`}
                      >
                        {diffRow === 0
                          ? "0"
                          : diffRow.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {unitPrice
                          ? unitPrice.toLocaleString("vi-VN")
                          : ""}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {lineTotal
                          ? lineTotal.toLocaleString("vi-VN")
                          : ""}
                      </td>
                      {/* 🔥 Nút xóa dòng */}
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => deleteItem(it.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-semibold"
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-slate-50">
                    <td className="px-2 py-2" />
                    <td
                      className="px-2 py-2 text-right font-semibold"
                      colSpan={3}
                    >
                      TỔNG:
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">
                      {totalPlanned.toLocaleString("vi-VN")}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">
                      {totalActual.toLocaleString("vi-VN")}
                    </td>
                    <td
                      className={`px-2 py-2 text-right font-semibold ${diff === 0
                        ? "text-slate-600"
                        : diff > 0
                          ? "text-emerald-700"
                          : "text-rose-700"
                        }`}
                    >
                      {diff === 0 ? "0" : diff.toLocaleString("vi-VN")}
                    </td>
                    <td colSpan={2}></td>
                    <td className="px-2 py-2" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}