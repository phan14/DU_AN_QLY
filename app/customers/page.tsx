"use client";

import { useEffect, useState } from "react";
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
  Filter
} from "lucide-react";

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

const CUSTOMER_TYPES = [
  { value: "brand", label: "Brand", color: "bg-purple-100 text-purple-700" },
  { value: "sỉ", label: "Khách sỉ", color: "bg-amber-100 text-amber-700" },
  { value: "lẻ", label: "Khách lẻ", color: "bg-emerald-100 text-emerald-700" },
] as const;

const PAGE_SIZES = [10, 25, 50];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // === Bộ lọc & Tìm kiếm ===
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"brand" | "sỉ" | "lẻ" | "">("");

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

  // === VALIDATION ===
  const validatePhone = (phone: string): string | null => {
    if (!phone.trim()) return null;
    const cleaned = phone.replace(/[\s\-\(\)]/g, "");
    const phoneRegex = /^0[3|5|7|8|9]\d{8}$/;
    if (!/^\d+$/.test(cleaned)) return "SĐT chỉ được chứa số";
    if (cleaned.length !== 10) return "SĐT phải có 10 số";
    if (!phoneRegex.test(cleaned)) return "SĐT không hợp lệ (VD: 0901234567)";
    return null;
  };

  const validateZalo = (zalo: string): string | null => {
    if (!zalo.trim()) return null;
    const trimmed = zalo.trim();
    if (trimmed.startsWith("http")) {
      try {
        new URL(trimmed);
        return null;
      } catch {
        return "Link Zalo không hợp lệ";
      }
    } else {
      return validatePhone(trimmed);
    }
  };

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

    const query = buildQuery();

    // Đếm tổng
    const { count, error: countError } = await query;

    if (countError || count === null) {
      alert("Lỗi đếm khách hàng");
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
      setCustomers(data as Customer[]);
      setTotalCount(count);
    }
    setLoading(false);
  };

  // Tải lại khi thay đổi trang, kích thước trang, hoặc bộ lọc
  useEffect(() => {
    setPage(1);
    loadCustomers();
  }, [typeFilter, pageSize]);

  // Tải lại khi thay đổi trang
  useEffect(() => {
    loadCustomers();
  }, [page]);

  // Tìm kiếm client-side (nhẹ, nhanh)
  const filteredCustomers = customers.filter((c) => {
    if (!search.trim()) return true;
    const keyword = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(keyword) ||
      (c.code && c.code.toLowerCase().includes(keyword)) ||
      (c.phone && c.phone.includes(keyword)) ||
      (c.email && c.email.toLowerCase().includes(keyword))
    );
  });

  const resetForm = () => {
    setCode(""); setName(""); setPhone(""); setZalo(""); setEmail(""); setAddress(""); setNote("");
    setType("lẻ");
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Tên khách hàng không được để trống");
      return;
    }

    const phoneError = validatePhone(phone);
    if (phoneError) {
      alert("Số điện thoại: " + phoneError);
      return;
    }

    const zaloError = validateZalo(zalo);
    if (zaloError) {
      alert("Zalo: " + zaloError);
      return;
    }

    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email)) {
      alert("Email không hợp lệ");
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
      alert(`Lỗi ${editingId ? "cập nhật" : "thêm"}: ` + error.message);
      return;
    }

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
    if (!confirm("Xóa khách hàng này? Dữ liệu sẽ mất vĩnh viễn.")) return;

    const { count, error: countError } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id);

    if (countError || (count ?? 0) > 0) {
      alert(
        countError
          ? "Lỗi kiểm tra đơn hàng."
          : `Không thể xóa: Khách đã có ${count} đơn đặt may.\nVui lòng chỉnh sửa thay vì xóa.`
      );
      return;
    }

    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) {
      alert("Lỗi xóa: " + error.message);
      return;
    }

    await loadCustomers();
  };

  const getTypeInfo = (t: string) => CUSTOMER_TYPES.find(x => x.value === t) || CUSTOMER_TYPES[2];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Quản lý khách hàng</h1>
            <p className="text-sm text-slate-500 mt-1">Brand • Khách sỉ • Khách lẻ</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
            >
              Trang chủ
            </Link>
            <div className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-medium">
              <UserPlus className="w-4 h-4" />
              <span>Khách hàng</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form thêm / sửa */}
          <section className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sticky top-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    {editingId ? <Edit3 className="w-5 h-5 text-emerald-600" /> : <UserPlus className="w-5 h-5 text-emerald-600" />}
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {editingId ? "Chỉnh sửa khách hàng" : "Thêm khách hàng mới"}
                  </h2>
                </div>
                {editingId && (
                  <button
                    onClick={resetForm}
                    className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Mã khách (tùy chọn)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="BRAND01, KH001..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Tên khách hàng <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tên brand / tên cá nhân"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Loại khách hàng</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CUSTOMER_TYPES.map((t) => (
                      <label
                        key={t.value}
                        className={`flex items-center justify-center px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer transition ${type === t.value
                          ? `${t.color} border-transparent ring-2 ring-offset-2 ring-emerald-500`
                          : "bg-white border-slate-300 hover:bg-slate-50"
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">SĐT</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0901234567"
                        className={`w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${phone && validatePhone(phone)
                          ? "border-rose-500 focus:ring-rose-500"
                          : "border-slate-300 focus:ring-emerald-500"
                          }`}
                      />
                    </div>
                    {phone && validatePhone(phone) && (
                      <p className="mt-1 text-xs text-rose-600">{validatePhone(phone)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Zalo</label>
                    <input
                      type="text"
                      value={zalo}
                      onChange={(e) => setZalo(e.target.value)}
                      placeholder="0901234567 hoặc https://zalo.me/..."
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${zalo && validateZalo(zalo)
                        ? "border-rose-500 focus:ring-rose-500"
                        : "border-slate-300 focus:ring-emerald-500"
                        }`}
                    />
                    {zalo && validateZalo(zalo) && (
                      <p className="mt-1 text-xs text-rose-600">{validateZalo(zalo)}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="brand@example.com"
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Địa chỉ</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Số nhà, phường, quận..."
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Ghi chú</label>
                  <div className="relative">
                    <StickyNote className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder="Yêu cầu đặc biệt, thanh toán, bao bì..."
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full mt-4 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>Đang lưu...</>
                  ) : (
                    <>
                      {editingId ? <Edit3 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                      {editingId ? "Cập nhật" : "Thêm khách hàng"}
                    </>
                  )}
                </button>
              </form>
            </div>
          </section>

          {/* Danh sách khách */}
          <section className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Danh sách khách hàng</h2>
                    <p className="text-sm text-slate-500">
                      Hiển thị <strong>{startIndex}-{endIndex}</strong> trong <strong>{totalCount}</strong> khách
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-slate-500" />
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as any)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Tất cả loại</option>
                        {CUSTOMER_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm tên, mã, SĐT..."
                        className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="p-6 space-y-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-32 bg-slate-100 rounded-lg"></div>
                    </div>
                  ))}
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <div className="bg-slate-100 w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <Search className="w-10 h-10 text-slate-300" />
                  </div>
                  <p className="text-lg font-medium">Không tìm thấy khách hàng</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
                    {filteredCustomers.map((c) => {
                      const typeInfo = getTypeInfo(c.type);
                      return (
                        <div
                          key={c.id}
                          className="border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow bg-white cursor-pointer"
                          onClick={() => startEdit(c)}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                                <span className="text-emerald-700 font-bold text-sm">
                                  {c.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <h3 className="font-semibold text-slate-900">{c.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                                    {typeInfo.label}
                                  </span>
                                  <span className="text-xs text-slate-500">#{c.code || c.id}</span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(c.id);
                              }}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-2 text-sm text-slate-600">
                            {c.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-slate-400" />
                                <span>{c.phone}</span>
                              </div>
                            )}
                            {c.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-slate-400" />
                                <span className="truncate">{c.email}</span>
                              </div>
                            )}
                            {c.address && (
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-slate-400" />
                                <span className="truncate">{c.address}</span>
                              </div>
                            )}
                            {c.note && (
                              <div className="flex items-start gap-2">
                                <StickyNote className="w-4 h-4 text-slate-400 mt-0.5" />
                                <span className="text-xs text-slate-500 line-clamp-2">{c.note}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {c.created_at ? new Date(c.created_at).toLocaleDateString("vi-VN") : ""}
                            </div>
                            <div className="flex items-center gap-1 text-emerald-600">
                              <Edit3 className="w-3 h-3" />
                              <span>Sửa</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Phân trang */}
                  {totalPages > 1 && (
                    <div className="border-t border-slate-200 px-5 py-3 bg-slate-50">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
                        <div className="text-slate-600">
                          Trang <strong>{page}</strong> / <strong>{totalPages}</strong>
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
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}