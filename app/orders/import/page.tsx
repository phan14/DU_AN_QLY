"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";
import { Upload, X, FileSpreadsheet, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";

type ExcelRow = {
  Ma_don?: string;
  Ten_khach?: string;
  SDT?: string;
  Ngay_dat?: string;
  Ngay_giao?: string;
  San_pham?: string;
  Mau?: string;
  Size?: string;
  So_luong?: number;
  Don_gia?: number;
};

export default function ImportOrdersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pushLog = (msg: string) => {
    setLog((prev) => [...prev, msg]);
  };

  // === KÉO THẢ & CHỌN FILE ===
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith(".xlsx") || droppedFile.name.endsWith(".xls"))) {
      setFile(droppedFile);
      setLog([]);
    } else {
      alert("Chỉ chấp nhận file Excel (.xlsx hoặc .xls)");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f) {
      setFile(f);
      setLog([]);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();
  const removeFile = () => {
    setFile(null);
    setLog([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // === LOGIC IMPORT GIỮ NGUYÊN 100% CỦA BẠN ===
  const handleImport = async () => {
    if (!file) {
      alert("Vui lòng chọn file Excel.");
      return;
    }

    setProcessing(true);
    setLog(["Bắt đầu import..."]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, {
        defval: "",
      });

      if (rows.length === 0) {
        pushLog("File không có dữ liệu.");
        setProcessing(false);
        return;
      }

      const ordersMap = new Map<string, { header: ExcelRow; items: ExcelRow[] }>();

      for (const r of rows) {
        const code = (r.Ma_don || "").toString().trim();
        if (!code) continue;

        if (!ordersMap.has(code)) {
          ordersMap.set(code, { header: r, items: [] });
        }
        ordersMap.get(code)!.items.push(r);
      }

      pushLog(`Tìm thấy ${ordersMap.size} mã đơn duy nhất.`);

      for (const [orderCode, group] of ordersMap.entries()) {
        const h = group.header;
        const customerName = (h.Ten_khach || "").toString().trim();
        if (!customerName) {
          pushLog(`Bỏ qua đơn ${orderCode}: thiếu tên khách.`);
          continue;
        }

        const phone = (h.SDT || "").toString().trim();

        // 1. Tìm/tạo khách hàng
        let customerId: number | null = null;
        {
          let { data: found, error } = await supabase
            .from("customers")
            .select("id")
            .eq("name", customerName)
            .eq("phone", phone || null)
            .maybeSingle();

          if (error) {
            pushLog(`Lỗi tìm khách ${orderCode}: ${error.message}`);
            continue;
          }

          if (!found) {
            const { data: inserted, error: insertErr } = await supabase
              .from("customers")
              .insert({ name: customerName, phone: phone || null })
              .select("id")
              .single();

            if (insertErr) {
              pushLog(`Tạo khách mới thất bại ${orderCode}: ${insertErr.message}`);
              continue;
            }
            customerId = inserted.id;
            pushLog(`Tạo khách mới: ${customerName}`);
          } else {
            customerId = found.id;
          }
        }

        if (!customerId) continue;

        // 2. Tạo đơn hàng
        const { data: newOrder, error: orderErr } = await supabase
          .from("orders")
          .insert({
            customer_id: customerId,
            order_code: orderCode,
            order_date: h.Ngay_dat?.toString().trim() || null,
            due_date: h.Ngay_giao?.toString().trim() || null,
            status: "NEW",
          })
          .select("id")
          .single();

        if (orderErr) {
          pushLog(`Tạo đơn ${orderCode} thất bại: ${orderErr.message}`);
          continue;
        }

        const orderId = newOrder.id;

        // 3. Tạo chi tiết
        const itemsPayload = group.items
          .map((r) => {
            const qty = Number(r.So_luong) || 0;
            if (!qty || !r.San_pham) return null;
            return {
              order_id: orderId,
              product_name: (r.San_pham || "").toString().trim(),
              color: (r.Mau || "").toString().trim() || null,
              size: (r.Size || "").toString().trim() || null,
              quantity: qty,
              unit_price: Number(r.Don_gia) || 0,
            };
          })
          .filter(Boolean);

        if (itemsPayload.length === 0) {
          pushLog(`Đơn ${orderCode} không có sản phẩm hợp lệ.`);
          continue;
        }

        const { error: itemsErr } = await supabase
          .from("order_items")
          .insert(itemsPayload);

        if (itemsErr) {
          pushLog(`Lưu sản phẩm đơn ${orderCode} lỗi: ${itemsErr.message}`);
        } else {
          pushLog(`${orderCode} • ${customerName} • ${itemsPayload.length} sản phẩm`);
        }
      }

      pushLog("HOÀN TẤT IMPORT!");
    } catch (err: any) {
      console.error(err);
      pushLog("Lỗi nghiêm trọng: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
              Import đơn hàng từ Excel
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Kéo thả file hoặc click để chọn • Mỗi dòng là 1 sản phẩm, gom theo Mã đơn
            </p>
          </div>
          <Link
            href="/orders"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Về danh sách
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Khu vực kéo thả */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-8">
            <h3 className="text-lg font-semibold mb-6">1. Chọn file Excel</h3>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${isDragging
                ? "border-emerald-500 bg-emerald-50"
                : file
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-slate-300 hover:border-slate-400"
                }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />

              {!file ? (
                <>
                  <Upload className={`w-16 h-16 mx-auto mb-5 ${isDragging ? "text-emerald-600" : "text-slate-400"}`} />
                  <p className="text-xl font-medium text-slate-700 mb-3">
                    {isDragging ? "Thả file vào đây" : "Kéo & thả file Excel vào đây"}
                  </p>
                  <p className="text-slate-500 mb-6">hoặc</p>
                  <button
                    onClick={openFilePicker}
                    className="px-8 py-4 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition shadow-md"
                  >
                    Chọn file từ máy tính
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="bg-emerald-100 p-5 rounded-full mb-4">
                    <FileSpreadsheet className="w-14 h-14 text-emerald-600" />
                  </div>
                  <p className="text-xl font-bold text-slate-800">{file.name}</p>
                  <p className="text-sm text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <button
                    onClick={removeFile}
                    className="mt-5 text-rose-600 hover:text-rose-700 flex items-center gap-1.5 font-medium"
                  >
                    <X className="w-4 h-4" /> Xóa file
                  </button>
                </div>
              )}
            </div>

            {/* Gợi ý cột */}
            <div className="mt-8 p-5 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="font-medium text-amber-900 mb-2">Cột bắt buộc trong file Excel:</p>
              <code className="text-sm bg-amber-100 px-2 py-1 rounded">
                Ma_don, Ten_khach, San_pham, So_luong
              </code>
              <p className="text-sm text-amber-800 mt-2">
                Các cột khác (SDT, Ngay_dat, Ngay_giao, Mau, Size, Don_gia) là tùy chọn.
              </p>
            </div>

            {/* Nút import */}
            <div className="mt-8 text-center">
              <button
                onClick={handleImport}
                disabled={!file || processing}
                className={`px-10 py-4 rounded-xl font-bold text-white text-lg transition-all shadow-lg flex items-center gap-3 mx-auto ${file && !processing
                  ? "bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
                  : "bg-slate-400 cursor-not-allowed"
                  }`}
              >
                {processing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Bắt đầu import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Log */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-slate-600" />
            Log import
          </h3>
          <div className="bg-slate-50 rounded-xl p-5 min-h-48 max-h-96 overflow-y-auto font-mono text-sm">
            {log.length === 0 ? (
              <p className="text-slate-400 italic">Chưa có thông tin...</p>
            ) : (
              <div className="space-y-1">
                {log.map((line, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 ${line.includes("HOÀN TẤT") || line.includes("Tạo khách mới")
                      ? "text-emerald-700"
                      : line.includes("lỗi") || line.includes("Bỏ qua")
                        ? "text-rose-600"
                        : "text-slate-700"
                      }`}
                  >
                    {line.includes("HOÀN TẤT") ? (
                      <CheckCircle className="w-4 h-4 mt-0.5 text-emerald-600" />
                    ) : line.includes("lỗi") ? (
                      <AlertCircle className="w-4 h-4 mt-0.5 text-rose-600" />
                    ) : (
                      <span className="text-slate-400">•</span>
                    )}
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}