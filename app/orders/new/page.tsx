"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";
import { Calendar, User, Package, Image, Plus, Trash2, DollarSign, StickyNote, Clock, ShoppingBag } from "lucide-react";

type Customer = {
  id: number;
  name: string;
  code: string | null;
};

type OrderItemFormRow = {
  product_name: string;
  color: string;
  size: string;
  quantity: string;
  unit_price: string;
};

const STATUS_OPTIONS = [
  { value: "NEW", label: "Mới tạo", color: "bg-blue-100 text-blue-700" },
  { value: "APPROVED", label: "Đã duyệt", color: "bg-indigo-100 text-indigo-700" },
  { value: "CUTTING", label: "Đang cắt", color: "bg-yellow-100 text-yellow-700" },
  { value: "SEWING", label: "Đang may", color: "bg-orange-100 text-orange-700" },
  { value: "FINISHING", label: "Hoàn thiện", color: "bg-purple-100 text-purple-700" },
  { value: "DONE", label: "Hoàn thành", color: "bg-emerald-100 text-emerald-700" },
  { value: "DELIVERED", label: "Đã giao", color: "bg-green-100 text-green-700" },
  { value: "CANCELLED", label: "Đã huỷ", color: "bg-red-100 text-red-700" },
];

// Chuyển yyyy-mm-dd → dd/mm/yyyy
function formatDateVN(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function todayInputFormat() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function generateOrderCode() {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const dateCode = `${dd}${mm}${yyyy}`;

  const { data } = await supabase
    .from("orders")
    .select("order_code")
    .like("order_code", `%${dateCode}%`)
    .order("id", { ascending: false })
    .limit(1);

  let nextNumber = 1;
  if (data && data.length > 0 && data[0].order_code) {
    const parts = data[0].order_code.split("-");
    const lastNum = Number(parts[2]);
    if (!Number.isNaN(lastNum)) nextNumber = lastNum + 1;
  }

  return `ARDEN-${dateCode}-${String(nextNumber).padStart(4, "0")}`;
}

export default function NewOrderPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const [customerId, setCustomerId] = useState<string>("");
  const [orderCode, setOrderCode] = useState("");
  const [orderDateInput, setOrderDateInput] = useState(todayInputFormat());
  const [dueDateInput, setDueDateInput] = useState("");
  const [statusInput, setStatusInput] = useState("NEW");
  const [noteInput, setNoteInput] = useState("");

  const [items, setItems] = useState<OrderItemFormRow[]>([
    { product_name: "", color: "", size: "", quantity: "", unit_price: "" },
  ]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load customers + auto code
  useEffect(() => {
    const load = async () => {
      setLoadingCustomers(true);
      const { data } = await supabase
        .from("customers")
        .select("id, name, code")
        .order("name", { ascending: true });
      if (data) setCustomers(data);
      setLoadingCustomers(false);

      const code = await generateOrderCode();
      setOrderCode(code);
    };
    load();
  }, []);

  // Image preview
  useEffect(() => {
    if (imageFile) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(imageFile);
    } else {
      setImagePreview(null);
    }
  }, [imageFile]);

  const handleAddRow = () => {
    setItems((prev) => [
      ...prev,
      { product_name: "", color: "", size: "", quantity: "", unit_price: "" },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (
    index: number,
    field: keyof OrderItemFormRow,
    value: string
  ) => {
    setItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const calculateLineTotal = (row: OrderItemFormRow): number => {
    const qty = parseFloat(row.quantity) || 0;
    const price = parseFloat(row.unit_price) || 0;
    return qty * price;
  };

  const calculateTotalAmount = () =>
    items.reduce((sum, row) => sum + calculateLineTotal(row), 0);

  const handleSaveOrder = async () => {
    if (!customerId) return alert("Vui lòng chọn khách hàng.");
    if (!orderDateInput) return alert("Vui lòng chọn ngày đặt.");

    const validItems = items.filter(
      (i) => i.product_name.trim() && parseFloat(i.quantity) > 0
    );
    if (validItems.length === 0)
      return alert("Vui lòng nhập ít nhất 1 sản phẩm hợp lệ.");

    setSaving(true);

    let inserted = false;
    let retryCount = 0;
    const maxRetries = 3;

    while (!inserted && retryCount < maxRetries) {
      try {
        const totalAmount = calculateTotalAmount();

        const { data: newOrder, error: orderError } = await supabase
          .from("orders")
          .insert({
            customer_id: +customerId,
            order_code: orderCode || null,
            order_date: orderDateInput,
            due_date: dueDateInput || null,
            status: statusInput,
            total_amount: totalAmount,
            note: noteInput || null,
            main_image_url: null,
          })
          .select("id")
          .single();

        if (orderError) {
          if (orderError.message.includes("duplicate key")) {
            retryCount++;
            const auto = await generateOrderCode();
            setOrderCode(auto);
            continue;
          }
          throw new Error(`Lỗi tạo đơn: ${orderError.message}`);
        }

        const orderId = newOrder.id;

        const itemsPayload = validItems.map((i) => ({
          order_id: orderId,
          product_name: i.product_name,
          color: i.color || null,
          size: i.size || null,
          quantity: +i.quantity,
          unit_price: +i.unit_price || 0,
        }));

        const { error: itemsError } = await supabase.from("order_items").insert(itemsPayload);
        if (itemsError) throw new Error(`Lỗi lưu sản phẩm: ${itemsError.message}`);

        if (imageFile) {
          const ext = imageFile.name.split(".").pop();
          const fileName = `order_${orderId}_${Date.now()}.${ext}`;
          const filePath = `orders/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("order-images")
            .upload(filePath, imageFile, { upsert: true });

          if (uploadError) throw new Error(`Lỗi upload ảnh: ${uploadError.message}`);

          const { data: { publicUrl } } = supabase.storage
            .from("order-images")
            .getPublicUrl(filePath);

          const { error: updateError } = await supabase
            .from("orders")
            .update({ main_image_url: publicUrl })
            .eq("id", orderId);

          if (updateError) throw new Error(`Lỗi cập nhật ảnh: ${updateError.message}`);
        }

        alert("Tạo đơn hàng thành công!");
        router.push(`/orders/${orderId}`);
        inserted = true;
      } catch (err: any) {
        console.error(err);
        alert(err.message || "Lỗi không xác định");
      }
    }

    if (!inserted) {
      alert("Không thể tạo đơn: mã đơn bị trùng sau nhiều lần thử.");
    }
    setSaving(false);
  };

  const totalAmount = calculateTotalAmount();
  const selectedStatus = STATUS_OPTIONS.find(s => s.value === statusInput);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tạo đơn đặt may mới</h1>
            <p className="text-sm text-slate-500 mt-1">Nhập thông tin chi tiết để quản lý đơn hàng</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
            >
              Trang chủ
            </Link>
            <button
              onClick={() => router.back()}
              className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1"
            >
              <span>←</span> Quay lại
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Form info */}
          <section className="lg:col-span-1 space-y-6">
            {/* Customer */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold">Khách hàng</h2>
              </div>
              <select
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${customerId ? "border-slate-300 focus:ring-blue-500" : "border-rose-300 focus:ring-rose-500"
                  }`}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Chọn khách hàng *</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} - ${c.name}` : c.name}
                  </option>
                ))}
              </select>
              {!customerId && <p className="mt-1 text-xs text-rose-600">Vui lòng chọn khách</p>}
            </div>

            {/* Order Info */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <ShoppingBag className="w-5 h-5 text-indigo-600" />
                </div>
                <h2 className="text-lg font-semibold">Thông tin đơn</h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mã đơn</label>
                <input
                  type="text"
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                  placeholder="Tự động: ARDEN-ddMMyyyy-0001"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* NGÀY ĐẶT - ĐÃ SỬA HIỂN THỊ */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                  <Calendar className="w-4 h-4" /> Ngày đặt
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={orderDateInput}
                    onChange={(e) => setOrderDateInput(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 opacity-0 absolute inset-0 cursor-pointer z-10"
                  />
                  <div className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm flex items-center justify-between pointer-events-none">
                    <span className="font-medium">
                      {orderDateInput ? formatDateVN(orderDateInput) : "Chọn ngày đặt"}
                    </span>
                    <Calendar className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* DỰ KIẾN GIAO - ĐÃ SỬA HIỂN THỊ */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                  <Clock className="w-4 h-4" /> Dự kiến giao
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={dueDateInput}
                    onChange={(e) => setDueDateInput(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 opacity-0 absolute inset-0 cursor-pointer z-10"
                  />
                  <div className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm flex items-center justify-between pointer-events-none">
                    <span className="font-medium">
                      {dueDateInput ? formatDateVN(dueDateInput) : "Chưa đặt hạn"}
                    </span>
                    <Calendar className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Trạng thái</label>
                <select
                  value={statusInput}
                  onChange={(e) => setStatusInput(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
                {selectedStatus && (
                  <div className="mt-2">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${selectedStatus.color}`}>
                      {selectedStatus.label}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                  <DollarSign className="w-4 h-4" /> Tổng tiền
                </label>
                <div className="w-full px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-lg font-bold text-emerald-700">
                  {totalAmount.toLocaleString("vi-VN")} đ
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                  <Image className="w-4 h-4" /> Hình ảnh (tùy chọn)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {imagePreview && (
                  <div className="mt-3">
                    <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-lg shadow-sm" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                  <StickyNote className="w-4 h-4" /> Ghi chú
                </label>
                <textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  rows={3}
                  placeholder="Giao 2 đợt, may tag riêng, thanh toán 50%..."
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
          </section>

          {/* Right: Product Table */}
          <section className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Package className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h2 className="text-lg font-semibold">Sản phẩm trong đơn</h2>
                </div>
                <button
                  onClick={handleAddRow}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition"
                >
                  <Plus className="w-4 h-4" />
                  Thêm sản phẩm
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Sản phẩm *</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Màu</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Size</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-700">SL *</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-700">Đơn giá</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-700">Thành tiền</th>
                      <th className="px-4 py-3 text-center font-medium text-slate-700"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => {
                      const lineTotal = calculateLineTotal(row);
                      const isValid = row.product_name.trim() && parseFloat(row.quantity) > 0;

                      return (
                        <tr key={i} className="border-b hover:bg-slate-50 transition">
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={row.product_name}
                              onChange={(e) => handleItemChange(i, "product_name", e.target.value)}
                              placeholder="Áo thun, quần jeans..."
                              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${!row.product_name.trim() ? "border-rose-300 focus:ring-rose-500" : "border-slate-300 focus:ring-emerald-500"
                                }`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={row.color}
                              onChange={(e) => handleItemChange(i, "color", e.target.value)}
                              placeholder="Đen, Trắng..."
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={row.size}
                              onChange={(e) => handleItemChange(i, "size", e.target.value)}
                              placeholder="S, M, L..."
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              value={row.quantity}
                              onChange={(e) => handleItemChange(i, "quantity", e.target.value)}
                              min="1"
                              placeholder="0"
                              className={`w-full px-3 py-2 border rounded-lg text-sm text-right focus:outline-none focus:ring-2 ${!row.quantity || parseFloat(row.quantity) <= 0 ? "border-rose-300 focus:ring-rose-500" : "border-slate-300 focus:ring-emerald-500"
                                }`}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              value={row.unit_price}
                              onChange={(e) => handleItemChange(i, "unit_price", e.target.value)}
                              min="0"
                              step="1000"
                              placeholder="0"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {lineTotal > 0 ? lineTotal.toLocaleString("vi-VN") : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {items.length > 1 && (
                              <button
                                onClick={() => handleRemoveRow(i)}
                                className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
                <div className="text-right">
                  <p className="text-sm text-slate-600">Tổng cộng</p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {totalAmount.toLocaleString("vi-VN")} đ
                  </p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="mt-8 text-center">
              <button
                onClick={handleSaveOrder}
                disabled={saving}
                className="inline-flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white font-medium text-lg rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition shadow-lg"
              >
                {saving ? (
                  <>Đang lưu đơn...</>
                ) : (
                  <>
                    <Package className="w-5 h-5" />
                    Lưu đơn hàng
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}