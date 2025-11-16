"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";

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

  const pushLog = (msg: string) => {
    setLog((prev) => [...prev, msg]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setLog([]);
  };

  const handleImport = async () => {
    if (!file) {
      alert("Vui lòng chọn file Excel.");
      return;
    }

    setProcessing(true);
    setLog([]);

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

      // Gom theo mã đơn
      const ordersMap = new Map<
        string,
        { header: ExcelRow; items: ExcelRow[] }
      >();

      for (const r of rows) {
        const code = (r.Ma_don || "").toString().trim();
        if (!code) continue;

        if (!ordersMap.has(code)) {
          ordersMap.set(code, { header: r, items: [] });
        }
        ordersMap.get(code)!.items.push(r);
      }

      pushLog(`Tìm thấy ${ordersMap.size} mã đơn trong file.`);

      // Lặp từng mã đơn → tạo khách (nếu cần), tạo đơn, tạo order_items
      for (const [orderCode, group] of ordersMap.entries()) {
        const h = group.header;

        const customerName = (h.Ten_khach || "").toString().trim();
        if (!customerName) {
          pushLog(`Bỏ qua đơn ${orderCode}: thiếu tên khách.`);
          continue;
        }

        const phone = (h.SDT || "").toString().trim();

        // 1) Tìm hoặc tạo khách hàng
        let customerId: number | null = null;
        {
          let { data: found, error } = await supabase
            .from("customers")
            .select("id")
            .eq("name", customerName)
            .eq("phone", phone)
            .maybeSingle();

          if (error) {
            pushLog(`Lỗi tìm khách cho đơn ${orderCode}: ${error.message}`);
            continue;
          }

          if (!found) {
            const { data: inserted, error: insertErr } = await supabase
              .from("customers")
              .insert({
                name: customerName,
                phone: phone || null,
              })
              .select("id")
              .single();

            if (insertErr) {
              pushLog(
                `Lỗi tạo khách mới cho đơn ${orderCode}: ${insertErr.message}`
              );
              continue;
            }
            customerId = inserted.id;
          } else {
            customerId = found.id;
          }
        }

        if (!customerId) {
          pushLog(`Không xác định được khách cho đơn ${orderCode}.`);
          continue;
        }

        // 2) Tạo đơn hàng
        const ngayDat =
          (h.Ngay_dat || "").toString().trim() || null; // yyyy-MM-dd
        const ngayGiao =
          (h.Ngay_giao || "").toString().trim() || null; // yyyy-MM-dd

        const { data: newOrder, error: orderErr } = await supabase
          .from("orders")
          .insert({
            customer_id: customerId,
            order_code: orderCode,
            order_date: ngayDat,
            due_date: ngayGiao,
            status: "NEW",
          })
          .select("id")
          .single();

        if (orderErr) {
          pushLog(`Lỗi tạo đơn ${orderCode}: ${orderErr.message}`);
          continue;
        }

        const orderId = newOrder.id as number;

        // 3) Tạo chi tiết sản phẩm
        const itemsPayload = group.items
          .map((r) => {
            const qty = Number(r.So_luong) || 0;
            if (!qty) return null;

            const price = Number(r.Don_gia) || 0;

            return {
              order_id: orderId,
              product_name: (r.San_pham || "").toString().trim() || "Sản phẩm",
              color: (r.Mau || "").toString().trim() || null,
              size: (r.Size || "").toString().trim() || null,
              quantity: qty,
              unit_price: price,
            };
          })
          .filter(Boolean) as any[];

        if (itemsPayload.length === 0) {
          pushLog(`Đơn ${orderCode} không có dòng sản phẩm hợp lệ => bỏ qua.`);
          continue;
        }

        const { error: itemsErr } = await supabase
          .from("order_items")
          .insert(itemsPayload);

        if (itemsErr) {
          pushLog(
            `Đơn ${orderCode} đã tạo nhưng lỗi khi lưu chi tiết: ${itemsErr.message}`
          );
        } else {
          pushLog(`✔ Đã import đơn ${orderCode} (${itemsPayload.length} dòng).`);
        }
      }

      pushLog("Hoàn tất import.");
    } catch (err: any) {
      console.error(err);
      pushLog("Lỗi đọc file Excel: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Import đơn hàng từ Excel</h1>
            <p className="text-xs text-slate-500">
              Đọc file Excel (mỗi dòng là 1 sản phẩm), gom theo cột Mã đơn.
            </p>
          </div>
          <Link
            href="/orders"
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100"
          >
            ← Về danh sách đơn
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 text-sm">
          <p className="font-semibold">1. Chọn file Excel</p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="text-xs"
          />

          <p className="text-xs text-slate-500">
            Yêu cầu tối thiểu các cột (header hàng đầu tiên):{" "}
            <code>Ma_don, Ten_khach, SDT, Ngay_dat, Ngay_giao, San_pham, Mau,
            Size, So_luong, Don_gia</code>. Bạn có thể map file hiện tại của mình
            sang tên cột này cho chuẩn.
          </p>

          <button
            onClick={handleImport}
            disabled={!file || processing}
            className="px-4 py-2 mt-2 rounded-xl bg-slate-900 text-white text-xs hover:bg-slate-800 disabled:opacity-60"
          >
            {processing ? "Đang import..." : "Bắt đầu import"}
          </button>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 text-xs">
          <p className="font-semibold mb-2">Log import</p>
          {log.length === 0 ? (
            <p className="text-slate-400">Chưa có thông tin.</p>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-auto">
              {log.map((line, idx) => (
                <li key={idx} className="whitespace-pre-wrap">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
