// reminder.js – PHIÊN BẢN HOÀN CHỈNH, GỬI ĐƯỢC NHIỀU NGƯỜI + NHÓM
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

// Config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY || !TELEGRAM_TOKEN) {
  console.error("Thiếu biến môi trường! Kiểm tra file .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BOT_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// DANH SÁCH NGƯỜI/NHÓM NHẬN TIN – THÊM BAO NHIÊU CŨNG ĐƯỢC
const CHAT_IDS = [
  "7277976026",        // ID cá nhân của bạn (đã xác nhận đúng 100%)
  "-5042074219"
  , // ID nhóm (bỏ comment + dán khi đã thêm bot vào nhóm)
  // "123456789",         // thêm người khác thoải mái
];

async function sendTelegramMessage(text, photo = null) {
  for (const chatId of CHAT_IDS) {
    try {
      if (photo) {
        await axios.post(`${BOT_URL}/sendPhoto`, {
          chat_id: chatId,
          photo: photo,
          caption: text,
          parse_mode: "HTML",
        });
      } else {
        await axios.post(`${BOT_URL}/sendMessage`, {
          chat_id: chatId,
          text: text,
          parse_mode: "HTML",
        });
      }
      console.log(`Đã gửi thành công tới ${chatId}`);
    } catch (err) {
      console.error(`Lỗi gửi tới ${chatId}:`, err.response?.data?.description || err.message);
    }
  }
}

async function checkAndSendReminders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_code,
      due_date,
      actual_delivery_date,
      total_amount,
      final_amount,
      deposit_amount,
      main_image_url,
      customers ( name, phone )
    `)
    .is("actual_delivery_date", null)
    .gte("due_date", today.toISOString().split("T")[0])
    .lte("due_date", new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
    .order("due_date", { ascending: true });

  if (error) {
    console.error("Lỗi Supabase:", error);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log("Hôm nay không có đơn cần nhắc");
    return;
  }

  let message = `<b>Nhắc Đơn Hàng Sắp Tới Hạn</b> (${new Date().toLocaleDateString("vi-VN")})\n\n`;

  for (const o of orders) {
    const due = new Date(o.due_date);
    const daysLeft = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    const status =
      daysLeft === 0
        ? "HÔM NAY HẠN GIAO!!!"
        : daysLeft > 0
          ? `Còn ${daysLeft} ngày`
          : `Quá hạn ${Math.abs(daysLeft)} ngày`;

    message += `<b>Đơn #${o.order_code || o.id}</b>\n`;
    message += `Khách: ${o.customers?.name || "Không rõ"}\n`;
    message += `SĐT: ${o.customers?.phone || "-"}\n`;
    message += `Hạn giao: ${due.toLocaleDateString("vi-VN")} → <b>${status}</b>\n`;
    message += `Tổng: ${Number(o.total_amount || 0).toLocaleString("vi-VN")} ₫\n`;
    message += `Đã cọc: ${Number(o.deposit_amount || 0).toLocaleString("vi-VN")} ₫\n`;
    message += `Còn lại: ${Number((o.final_amount || o.total_amount || 0) - (o.deposit_amount || 0)).toLocaleString("vi-VN")} ₫\n\n`;

    if (o.main_image_url) {
      await sendTelegramMessage(message, o.main_image_url);
      message = ""; // reset cho đơn tiếp theo
    }
  }

  if (message.trim()) {
    await sendTelegramMessage(message);
  }

  console.log("Hoàn thành kiểm tra và gửi nhắc nhở!");
}

// Chạy ngay để test
checkAndSendReminders();