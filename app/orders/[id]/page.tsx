"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import dayjs from "dayjs";
import { Calendar, User, Package, Image, Plus, Trash2, DollarSign, StickyNote, Clock, ShoppingBag, X } from "lucide-react";

type Order = {
  id: number;
  order_code: string | null;
  order_date: string | null;
  due_date: string | null;
  status: string | null;
  note_internal: string | null;
  note_customer: string | null;
  total_amount: number | null;
  additional_costs: number | null;
  additional_costs_desc: string | null;
  discount: number | null;
  deposit: number | null;
  final_amount: number | null;
  main_image_url: string | null;
  images_urls: string[] | null;

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
  actual_quantity_input: string;
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
  if (!v || isNaN(v)) return "0 đ";
  return v.toLocaleString("vi-VN") + " đ";
}

export default function OrderDetailPage() {
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
          note_internal,
          note_customer,
          total_amount,
          additional_costs,
          additional_costs_desc,
          discount,
          deposit,
          final_amount,
          main_image_url,
          images_urls,
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

      const { error: uploadError } = await supabase.storage
        .from("order-images")
        .upload(filePath, imageFile, { upsert: true });

      if (uploadError) {
        console.error(uploadError);
        alert("Lỗi upload hình: " + uploadError.message);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("order-images").getPublicUrl(filePath);

      const newImagesUrls = [...(order.images_urls || []), publicUrl];

      const updates: any = { images_urls: newImagesUrls };
      if (newImagesUrls.length === 1) updates.main_image_url = publicUrl;

      const { error: updateError } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", order.id);

      if (updateError) {
        console.error(updateError);
        alert("Lỗi cập nhật link hình: " + updateError.message);
        return;
      }

      setOrder({ ...order, images_urls: newImagesUrls, main_image_url: updates.main_image_url || order.main_image_url });
      setImageFile(null);
      alert("Cập nhật hình thành công!");
    } finally {
      setSavingImage(false);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-6 h-6 text-emerald-600" />
              Đơn hàng {order.order_code || `#${order.id}`}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Khách hàng: {order.customers?.name || "N/A"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/orders"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
            >
              Danh sách đơn
            </Link>
            <Link
              href="/"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
            >
              Trang chủ
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Thông tin chung */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ngày đặt</label>
            <p className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm">
              {order.order_date ? dayjs(order.order_date).format("DD/MM/YYYY") : "-"}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Hạn giao</label>
            <p className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm">
              {order.due_date ? dayjs(order.due_date).format("DD/MM/YYYY") : "-"}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Trạng thái</label>
            <select
              value={order.status || ""}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={savingStatus}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Ghi chú */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ghi chú nội bộ</label>
            <p className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm min-h-[80px]">
              {order.note_internal || "Không có"}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ghi chú cho khách</label>
            <p className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm min-h-[80px]">
              {order.note_customer || "Không có"}
            </p>
          </div>
        </div>

        {/* Tài chính */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Tài chính
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tổng sản phẩm</label>
              <p className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium">
                {formatMoney(order.total_amount)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phụ phí</label>
              <p className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium">
                {formatMoney(order.additional_costs)}
              </p>
              {order.additional_costs_desc && (
                <p className="mt-1 text-xs text-slate-500">{order.additional_costs_desc}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Giảm giá</label>
              <p className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium">
                {formatMoney(order.discount)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tiền cọc</label>
              <p className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium">
                {formatMoney(order.deposit)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Thành tiền cuối cùng</label>
              <p className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-700">
                {formatMoney(order.final_amount)}
              </p>
            </div>
          </div>
        </div>

        {/* Hình ảnh */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Image className="w-5 h-5 text-emerald-600" />
            Hình ảnh
          </h3>
          <div className="flex flex-wrap gap-4">
            {(order.images_urls || []).map((url, idx) => (
              <img key={idx} src={url} alt={`Hình ${idx + 1}`} className="w-32 h-32 object-cover rounded-lg border" />
            ))}
            {(order.images_urls || []).length === 0 && (
              <p className="text-sm text-slate-500">Chưa có hình ảnh</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              className="text-sm"
            />
            <button
              onClick={handleUploadImage}
              disabled={!imageFile || savingImage}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {savingImage ? "Đang tải lên..." : "Thêm hình"}
            </button>
          </div>
        </div>

        {/* Bảng sản phẩm */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
              Chi tiết sản phẩm
            </h3>
            <button
              onClick={handleSaveActualQuantities}
              disabled={savingActual}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {savingActual ? "Đang lưu..." : "Lưu SL thực tế"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Sản phẩm</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Màu</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Size</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">SL đặt</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">SL thực tế</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Đơn giá</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Thành tiền</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                      </div>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p>Chưa có sản phẩm</p>
                    </td>
                  </tr>
                ) : (
                  items.map((it) => {
                    const planned = Number(it.quantity) || 0;
                    const trimmed = it.actual_quantity_input.trim();
                    const actual = trimmed === "" ? 0 : Number(trimmed.replace(/\./g, "").replace(",", ".")) || 0;
                    const lineTotal = planned * (Number(it.unit_price) || 0);

                    return (
                      <tr key={it.id} className="border-t hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-medium">{it.product_name}</td>
                        <td className="px-4 py-3">{it.color || "-"}</td>
                        <td className="px-4 py-3">{it.size || "-"}</td>
                        <td className="px-4 py-3 text-right">{planned.toLocaleString("vi-VN")}</td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={it.actual_quantity_input}
                            onChange={(e) => handleActualChange(it.id, e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-right"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">{formatMoney(it.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatMoney(lineTotal)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => deleteItem(it.id)}
                            className="text-rose-600 hover:text-rose-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}