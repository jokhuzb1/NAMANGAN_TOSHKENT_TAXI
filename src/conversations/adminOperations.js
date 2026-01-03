const { Keyboard } = require("grammy");
const Admin = require("../models/Admin");
const RideRequest = require("../models/RideRequest");
const { broadcastRequest } = require("../utils/broadcastUtils");
// NOTE: Do NOT import mainBot here - circular dependency issue!
// We get the mainBot reference dynamically at runtime via adminBot.mainBot
const keyboards = require("../utils/keyboards");

// Helper Keyboards for Admin
const cancelKb = new Keyboard().text("❌ Bekor qilish").resized();

const routeKb = new Keyboard()
    .text("Tashkent ➡️ Namangan").row()
    .text("Namangan ➡️ Tashkent").row()
    .text("❌ Bekor qilish").resized();

const timeKb = new Keyboard()
    .text("Hozir").row()
    .text("Bugun").text("Ertaga").row()
    .text("❌ Bekor qilish").resized();

const seatsKb = new Keyboard()
    .text("1").text("2").text("3").text("4").row()
    .text("❌ Bekor qilish").resized();

const adminMenu = new Keyboard()
    .text("🕒 Kutilayotganlar").text("✅ Tasdiqlanganlar")
    .row()
    .text("❌ Rad etilganlar").text("📣 Hammaga Xabar")
    .row()
    .text("🚖 Buyurtma Yaratish").text("📋 Mening Buyurtmalarim")
    .row()
    .text("➕ Admin Qo'shish")
    .resized();

async function addAdminConversation(conversation, ctx) {
    await ctx.reply("🆔 Янги Админнинг Telegram ID сини киритинг:", { reply_markup: cancelKb });
    const { message } = await conversation.waitFor("message:text");

    if (message.text === "❌ Bekor qilish") {
        await ctx.reply("❌ Бекор қилинди.", { reply_markup: adminMenu });
        return;
    }

    const id = parseInt(message.text);
    const addedBy = ctx.from.id; // Extract before external to avoid serialization issues

    if (isNaN(id)) {
        await ctx.reply("❌ ID фақат рақамлардан иборат бўлиши керак.", { reply_markup: adminMenu });
        return;
    }

    const exists = await conversation.external(() => Admin.findOne({ telegramId: id }));
    if (exists) {
        await ctx.reply("⚠️ Бу фойдаланувчи аллақачон админ.", { reply_markup: adminMenu });
        return;
    }

    await conversation.external(() => Admin.create({
        telegramId: id,
        addedBy: addedBy,
        name: "Yangi Admin"
    }));

    await ctx.reply(`✅ Админ (ID: <code>${id}</code>) муваффақиятли қўшилди!`, { parse_mode: "HTML", reply_markup: adminMenu });
}

async function adminCreateOrderConversation(conversation, ctx) {
    const state = {};

    // 1. Route
    await ctx.reply("📍 Yo'nalishni tanlang:", { reply_markup: routeKb });
    const routeRes = await conversation.waitFor("message:text");
    if (routeRes.message.text === "❌ Bekor qilish") {
        await ctx.reply("❌ Bekor qilindi.", { reply_markup: adminMenu });
        return;
    }
    const routeText = routeRes.message.text;
    if (routeText.includes("Tashkent ➡️ Namangan")) {
        state.from = "Tashkent"; state.to = "Namangan";
    } else if (routeText.includes("Namangan ➡️ Tashkent")) {
        state.from = "Namangan"; state.to = "Tashkent";
    } else {
        await ctx.reply("❌ Noto'g'ri yo'nalish. Bekor qilindi.");
        return;
    }

    // 2. Phone - Auto-include +998 prefix
    await ctx.reply("📞 Телефон рақамни киритинг:\n\n<b>+998</b> <code>XX XXX XX XX</code>\n\n<i>Фақат 9 та рақамни киритинг (масалан: 90 123 45 67)</i>", {
        reply_markup: cancelKb,
        parse_mode: "HTML"
    });
    let phoneValid = false;
    let phoneText = "";

    while (!phoneValid) {
        const phoneRes = await conversation.waitFor("message:text");
        const text = phoneRes.message.text;

        if (text === "❌ Bekor qilish") {
            await ctx.reply("❌ Bekor qilindi.", { reply_markup: adminMenu });
            return;
        }

        // Remove all spaces and non-digit characters except +
        const cleaned = text.replace(/[\s\-\(\)]/g, '');

        // Check if user entered full number with +998
        if (cleaned.startsWith('+998') && cleaned.length === 13) {
            phoneText = cleaned;
            phoneValid = true;
        }
        // Check if user entered 998XXXXXXXXX (12 digits)
        else if (cleaned.startsWith('998') && cleaned.length === 12) {
            phoneText = '+' + cleaned;
            phoneValid = true;
        }
        // Check if user entered just 9 digits (most common case)
        else if (/^\d{9}$/.test(cleaned)) {
            phoneText = '+998' + cleaned;
            phoneValid = true;
        }
        // Check if user entered with spaces like "90 123 45 67" (9 digits total)
        else if (/^\d[\d\s]{8,12}$/.test(text)) {
            const digitsOnly = text.replace(/\D/g, '');
            if (digitsOnly.length === 9) {
                phoneText = '+998' + digitsOnly;
                phoneValid = true;
            }
        }

        if (!phoneValid) {
            await ctx.reply("⚠️ Нотўғри формат!\n\nФақат 9 та рақам киритинг:\n<code>90 123 45 67</code> ёки <code>901234567</code>", { parse_mode: "HTML" });
        }
    }
    state.contactPhone = phoneText;

    // 3. Time
    await ctx.reply("⏰ Vaqt:", { reply_markup: timeKb });
    const timeRes = await conversation.waitFor("message:text");
    if (timeRes.message.text === "❌ Bekor qilish") {
        await ctx.reply("❌ Bekor qilindi.", { reply_markup: adminMenu });
        return;
    }
    state.time = timeRes.message.text;

    // 4. Seats
    await ctx.reply("💺 Yo'lovchilar soni:", { reply_markup: seatsKb });
    const seatRes = await conversation.waitFor("message:text");
    if (seatRes.message.text === "❌ Bekor qilish") {
        await ctx.reply("❌ Bekor qilindi.", { reply_markup: adminMenu });
        return;
    }
    const seats = parseInt(seatRes.message.text);
    if (isNaN(seats)) {
        await ctx.reply("❌ Raqam kiritilmadi.");
        return;
    }
    state.seats = seats;

    // 5. District
    await ctx.reply("🚩 Aniq manzil (Orientir):", { reply_markup: cancelKb });
    const distRes = await conversation.waitFor("message:text");
    if (distRes.message.text === "❌ Bekor qilish") {
        await ctx.reply("❌ Bekor qilindi.", { reply_markup: adminMenu });
        return;
    }
    state.district = distRes.message.text;

    // Confirm
    const summary = `
📝 <b>Buyurtmani tasdiqlang:</b>

📍 ${state.from} ➡️ ${state.to}
📞 ${state.contactPhone}
⏰ ${state.time}
💺 ${state.seats} kishi
🚩 ${state.district}
`;
    // Reuse custom keyboard or simple text
    await ctx.reply(summary, {
        parse_mode: "HTML",
        reply_markup: new Keyboard().text("✅ Tasdiqlash").text("❌ Bekor qilish").resized()
    });

    const confirmRes = await conversation.waitFor("message:text");
    if (confirmRes.message.text !== "✅ Tasdiqlash") {
        await ctx.reply("❌ Bekor qilindi.", { reply_markup: adminMenu });
        return;
    }

    // Save
    // Save
    let request;
    try {
        await conversation.external(async () => {
            console.log(`[ADMIN-OP] Creating Request. From: ${state.from}, To: ${state.to}, Phone: ${state.contactPhone}`);
            request = await RideRequest.create({
                passengerId: 0, // Use 0 to indicate "System/Admin" and prevent "Self-Send" blocking if Admin is also a Driver
                from: state.from,
                to: state.to,
                time: state.time,
                seats: state.seats,
                seatType: 'any',
                district: state.district,
                contactPhone: state.contactPhone,
                createdBy: 'admin',
                status: 'searching'
            });
            console.log(`[ADMIN-OP] Request Created. ID: ${request._id}, CreatedBy: ${request.createdBy}`);
        });
    } catch (dbErr) {
        console.error("[ADMIN-OP] DB Error:", dbErr);
        await ctx.reply("❌ Bazaga yozishda xatolik bo'ldi.", { reply_markup: adminMenu });
        return;
    }

    await ctx.reply("✅ Buyurtma yaratildi (ADMIN) va haydovchilarga yuborilmoqda...", { reply_markup: adminMenu });

    // Broadcast - Get mainBot dynamically to avoid circular dependency
    await conversation.external(async () => {
        try {
            // Get the mainBot reference from adminBot (set in index.js)
            const adminBot = require('../adminBot');
            if (!adminBot.mainBot || !adminBot.mainBot.api) {
                console.error('[ADMIN-OP] mainBot reference not available!');
                return;
            }
            await broadcastRequest(adminBot.mainBot.api, request, { isAdmin: true });
            console.log(`[ADMIN-OP] Broadcast completed for ${request._id}`);
        } catch (bcError) {
            console.error("[ADMIN-OP] Broadcast failed:", bcError);
        }
    });
}

module.exports = { addAdminConversation, adminCreateOrderConversation };
