
const { Bot, session, InlineKeyboard, Keyboard, InputFile } = require("grammy");
const { conversations, createConversation } = require("@grammyjs/conversations");
const { addAdminConversation, adminCreateOrderConversation } = require("./conversations/adminOperations");
const dynamicKeyboards = require("./utils/keyboardsDynamic");
const config = require("./config");
const User = require("./models/User");
const Admin = require("./models/Admin");
const { formatDateTime } = require("./utils/i18n");
const mongoose = require("mongoose");

if (!config.ADMIN_BOT_TOKEN) {
    console.error("⚠️  ADMIN_BOT_TOKEN is missing in .env or config.js");
}

const adminBot = new Bot(config.ADMIN_BOT_TOKEN || "FAKE_TOKEN_FOR_INIT_IF_MISSING");

// Middleware
adminBot.use(session({ initial: () => ({}) }));
adminBot.use(conversations());
adminBot.use(createConversation(addAdminConversation));
adminBot.use(createConversation(adminCreateOrderConversation));

// Global Error Handler - Prevent crash on expired callbacks etc.
adminBot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[ADMIN BOT ERROR] Error while handling update ${ctx.update.update_id}:`);
    console.error(err.error.message || err.error);
    // Try to gracefully respond if possible
    if (ctx.callbackQuery) {
        ctx.answerCallbackQuery("⚠️ Хатолик юз берди.").catch(() => { });
    }
});

// Auth Middleware: Check if user is Admin
adminBot.use(async (ctx, next) => {
    // Check if it's the SUPER ADMIN (Manual override for setup)
    if (ctx.from.id == config.ADMIN_ID) {
        return next();
    }
    const admin = await Admin.findOne({ telegramId: ctx.from.id });
    if (admin) {
        return next();
    }
    // If not admin and not super admin
    if (ctx.command === 'start') { // Allow start but tell them they are not authorized
        return ctx.reply("⛔️ Sizda admin huquqi yo'q.");
    }
    // Silently ignore other updates from non-admins
});

// --- Admin Menu Keyboard ---
const adminMenu = new Keyboard()
    .text("🕒 Кутилаётганлар").text("✅ Тасдиқланганлар")
    .row()
    .text("❌ Рад этилганлар").text("📣 Ҳаммага Хабар")
    .row()
    .text("🚖 Буюртма Яратиш").text("📋 Менинг Буюртмаларим")
    .row()
    .text("👨‍✈️ Админлар").text("➕ Админ Қўшиш")
    .resized();

// Commands
adminBot.command("start", async (ctx) => {
    await ctx.reply(`👨‍✈️ Админ Панелига хуш келибсиз, ${ctx.from.first_name}!\n\nЯнги ҳайдовчилар сўровлари автоматик равишда шу ерга келади.`, {
        reply_markup: adminMenu
    });
});

adminBot.command("add_admin", async (ctx) => {
    const id = parseInt(ctx.match);
    if (isNaN(id)) return ctx.reply("⚠️ ID нотўғри. Фойдаланиш: /add_admin 123456789");

    const exists = await Admin.findOne({ telegramId: id });
    if (exists) return ctx.reply("⚠️ Бу фойдаланувчи аллақачон админ.");

    await Admin.create({ telegramId: id, addedBy: ctx.from.id, name: "Unknown" });
    await ctx.reply(`✅ Админ қўшилди (ID: ${id}).`);
});

// Admin list with remove buttons
adminBot.command("admins", async (ctx) => {
    await showAdminList(ctx);
});

// Handler for "👨‍✈️ Админлар" button
adminBot.hears("👨‍✈️ Админлар", async (ctx) => {
    await showAdminList(ctx);
});

async function showAdminList(ctx) {
    const admins = await Admin.find({});
    let message = "<b>👨‍✈️ Админлар Рўйхати:</b>\n\n";

    // Add Super Admin from config
    const superAdminId = config.ADMIN_ID;
    if (superAdminId) {
        message += `👑 <b>Супер Админ:</b> <code>${superAdminId}</code>\n`;
    }

    const keyboard = new InlineKeyboard();

    if (admins.length > 0) {
        message += "\n<b>Бошқа Админлар:</b>\n";
        admins.forEach((admin, index) => {
            message += `${index + 1}. ${admin.name || "Номаълум"} (ID: <code>${admin.telegramId}</code>)\n`;
            // Add remove button for each admin (except super admin)
            keyboard.text(`🗑 ${admin.telegramId}`, `remove_admin_${admin._id}`).row();
        });
    } else {
        message += "\n<i>Бошқа админлар йўқ.</i>";
    }

    await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
}

// Reusable List Function
async function listDrivers(ctx, status, title) {
    const drivers = await User.find({ role: 'driver', status: status }).limit(10);
    let text = title + "\n\n";
    let keyboard = new InlineKeyboard();

    if (drivers.length === 0) {
        text += "<i>Ҳозирча бўш.</i>";
    } else {
        drivers.forEach(d => {
            keyboard.text(`${d.name} (${d.phone})`, `driver_info_${d._id}`).row();
        });
    }

    // Check if called via callback or message
    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: "HTML" });
        } catch (e) {
            await ctx.reply(text, { reply_markup: keyboard, parse_mode: "HTML" });
        }
    } else {
        await ctx.reply(text, { reply_markup: keyboard, parse_mode: "HTML" });
    }
}

// Menu Handlers - Cyrillic
adminBot.hears("🕒 Кутилаётганлар", async (ctx) => listDrivers(ctx, 'pending_verification', "🕒 <b>Кутилаётган Ҳайдовчилар:</b>"));
adminBot.hears("✅ Тасдиқланганлар", async (ctx) => listDrivers(ctx, 'approved', "✅ <b>Тасдиқланган Ҳайдовчилар:</b>"));
adminBot.hears("❌ Рад этилганлар", async (ctx) => listDrivers(ctx, 'rejected', "❌ <b>Рад этилган Ҳайдовчилар:</b>"));
adminBot.hears("➕ Админ Қўшиш", async (ctx) => await ctx.conversation.enter("addAdminConversation"));
adminBot.hears("🚖 Буюртма Яратиш", async (ctx) => await ctx.conversation.enter("adminCreateOrderConversation"));
adminBot.hears("📋 Менинг Буюртмаларим", async (ctx) => {
    // Find requests created by admin
    const requests = await require("./models/RideRequest").find({ createdBy: 'admin', status: 'searching' }).sort({ createdAt: -1 }).limit(10);

    if (requests.length === 0) {
        return ctx.reply("❌ Сизда фаол админ-буюртмалари йўқ.");
    }

    await ctx.reply(`📋 <b>Фаол Админ Буюртмалари (${requests.length} та):</b>`, { parse_mode: "HTML" });

    for (const req of requests) {
        const timeCreated = formatDateTime(req.createdAt);
        const msg = `
📍 <b>${req.from} ➡️ ${req.to}</b>
📞 ${req.contactPhone}
⏰ ${req.time}
💺 ${req.seats} kishi
👀 Ko'rildi: ${req.clicksCount}/5
📅 ${timeCreated}
`;
        const kb = new InlineKeyboard()
            .text("🔄 Qayta Broadcast", `admin_rebroadcast_${req._id}`)
            .text("🗑 O'chirish", `admin_delete_${req._id}`);

        await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb });
    }
});


// Broadcast Handler
adminBot.hears("📣 Ҳаммага Хабар", async (ctx) => {
    ctx.session.step = 'broadcast';
    await ctx.reply("📢 <b>Хабарни юборинг:</b>\n\n(Матн, расм, видео ёки бошқа турдаги хабарни юборишингиз мумкин).", {
        parse_mode: "HTML",
        reply_markup: {
            keyboard: [[{ text: "🔙 Бекор қилиш" }]],
            resize_keyboard: true
        }
    });
});

adminBot.hears("🔙 Бекор қилиш", async (ctx) => {
    ctx.session.step = null;
    await ctx.reply("❌ Хабар юбориш бекор қилинди.", { reply_markup: adminMenu });
});

// Handle Broadcast Message
adminBot.on("message", async (ctx, next) => {
    if (ctx.session.step === 'broadcast') {
        const users = await User.find({});
        let successCount = 0;
        let failCount = 0;

        const statusMsg = await ctx.reply(`⏳ Xabar yuborilmoqda... (Jami: ${users.length} ta foydalanuvchi)`);

        for (const user of users) {
            try {
                await adminBot.mainBot.api.copyMessage(user.telegramId, ctx.chat.id, ctx.message.message_id);
                successCount++;
            } catch (error) {
                console.error(`Failed to broadcast to ${user.telegramId}:`, error.message);
                failCount++;
            }
        }

        ctx.session.step = null;
        await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => { });
        await ctx.reply(`✅ <b>Xabar yuborildi!</b>\n\n🟢 Muvaffaqiyatli: ${successCount}\n🔴 Muvaffaqiyatsiz: ${failCount}`, {
            parse_mode: "HTML",
            reply_markup: adminMenu
        });
        return;
    }
    await next();
});

// Callback Handlers
adminBot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    // Remove Admin Handler
    if (data.startsWith("remove_admin_")) {
        const adminId = data.replace("remove_admin_", "");
        try {
            await Admin.findByIdAndDelete(adminId);
            await ctx.answerCallbackQuery("✅ Админ ўчирилди!");
            await ctx.deleteMessage();
            // Refresh the list
            await showAdminList(ctx);
        } catch (e) {
            console.error(e);
            await ctx.answerCallbackQuery("❌ Хатолик юз берди.");
        }
        return;
    }

    if (data.startsWith("approve_")) {
        const userId = data.replace("approve_", "");
        const user = await User.findById(userId);
        if (!user) return ctx.reply("⚠️ Фойдаланувчи топилмади.");

        user.status = 'approved';
        user.isApproved = true;
        user.isOnline = true;
        await user.save();

        if (ctx.callbackQuery.message.caption) {
            await ctx.editMessageCaption({
                caption: ctx.callbackQuery.message.caption + "\n\n✅ TASDIQLANDI",
                reply_markup: { inline_keyboard: [] }
            });
        } else if (ctx.callbackQuery.message.text) {
            await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ TASDIQLANDI", {
                reply_markup: { inline_keyboard: [] }
            });
        }

        try {
            if (adminBot.mainBot) {
                const lang = user.language || 'uz_cyrillic';
                const menu = dynamicKeyboards.getDriverMenu(lang, user.isOnline, false, 0);
                await adminBot.mainBot.api.sendMessage(user.telegramId, "✅ Tabriklaymiz! Sizning akkauntingiz tasdiqlandi. Endi buyurtmalarni qabul qilishingiz mumkin.", {
                    reply_markup: menu
                });
            }
        } catch (e) {
            console.error("Failed to notify driver:", e.message);
        }
        await ctx.answerCallbackQuery();
        return;
    }

    if (data.startsWith("decline_")) {
        const userId = data.replace("decline_", "");
        const user = await User.findById(userId);
        if (user) {
            user.status = 'rejected';
            await user.save();
        }

        if (ctx.callbackQuery.message.caption) {
            await ctx.editMessageCaption({
                caption: ctx.callbackQuery.message.caption + "\n\n❌ RAD ETILDI",
                reply_markup: { inline_keyboard: [] }
            });
        } else if (ctx.callbackQuery.message.text) {
            await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n❌ RAD ETILDI", {
                reply_markup: { inline_keyboard: [] }
            });
        }

        try {
            if (adminBot.mainBot) {
                await adminBot.mainBot.api.sendMessage(user.telegramId, "❌ Afsuski, sizning akkauntingiz rad etildi.");
            }
        } catch (e) { console.error(e) }
        await ctx.answerCallbackQuery();
        return;
    }

    if (data.startsWith("drivers_list_")) {
        const status = data.replace("drivers_list_", "");
        let title = "";
        if (status === 'pending_verification') title = "🕒 <b>Kutilayotgan Haydovchilar:</b>";
        if (status === 'approved') title = "✅ <b>Tasdiqlangan Haydovchilar:</b>";
        if (status === 'rejected') title = "❌ <b>Rad etilgan Haydovchilar:</b>";

        await listDrivers(ctx, status, title);
        await ctx.answerCallbackQuery();
        return;
    }

    // Driver Details
    if (data.startsWith("driver_info_")) {
        const userId = data.replace("driver_info_", "");
        const driver = await User.findById(userId);

        if (!driver) return ctx.reply("⚠️ Haydovchi topilmadi.");

        const caption = `
<b>👤 Haydovchi Ma'lumotlari</b>

📛 Ism: ${driver.name}
📞 Tel: ${driver.phone}
🚗 Model: ${driver.carDetails ? driver.carDetails.model : driver.carModel}
🎨 Rang: ${driver.carDetails ? driver.carDetails.color : "-"}
📅 Yil: ${driver.carDetails ? driver.carDetails.year : "-"}
💺 Joy: ${driver.carDetails ? driver.carDetails.seats : "-"}
📊 Status: ${driver.status}
`;

        const keyboard = new InlineKeyboard();
        if (driver.status === 'pending_verification') {
            keyboard.text("✅ Tasdiqlash", `approve_${driver._id}`).text("❌ Rad etish", `decline_${driver._id}`).row();
        } else if (driver.status === 'approved') {
            keyboard.text("❌ Bloklash", `decline_${driver._id}`).row();
        } else if (driver.status === 'rejected') {
            keyboard.text("✅ Qayta Tasdiqlash", `approve_${driver._id}`).row();
        }

        // Always show photo button if photos exist
        if (driver.selfie && driver.selfie.telegramFileId) {
            keyboard.row().text("📷 Rasmlarni ko'rish", `view_photos_${driver._id}`);
        }
        keyboard.row().text("🔙 Ro'yxatga qaytish", `drivers_list_${driver.status}`);


        // For smoother UX, we can delete previous menu msg and send new one.
        await ctx.deleteMessage().catch(() => { });
        await ctx.reply(caption, { parse_mode: "HTML", reply_markup: keyboard });
        await ctx.answerCallbackQuery();
        return;
    }

    // View Photos Handler
    if (data.startsWith("view_photos_")) {
        const userId = data.replace("view_photos_", "");
        const driver = await User.findById(userId);
        if (!driver) return ctx.reply("⚠️ Haydovchi topilmadi.");

        const sendPhotoByUrl = async (fileId, caption = "", showActions = false) => {
            try {
                const file = await adminBot.mainBot.api.getFile(fileId);
                const url = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                let keyboard = undefined;
                if (showActions) {
                    keyboard = new InlineKeyboard();
                    // Show actions for ANY status so admin can force reject image even if approved
                    keyboard.text("❌ Selfie Xato", `reject_selfie_${driver._id}`).text("❌ Mashina Rasmi Xato", `reject_car_${driver._id}`).row();

                    if (driver.status === 'pending_verification') {
                        keyboard.text("✅ Tasdiqlash", `approve_${driver._id}`).text("❌ Rad etish", `decline_${driver._id}`);
                    }
                }

                await ctx.replyWithPhoto(new InputFile(buffer), { caption, reply_markup: keyboard });
            } catch (e) {
                console.error("Proxy send failed:", e.message);
                await ctx.reply("⚠️ Media yuklanmadi.");
            }
        };

        await ctx.reply("⏬ Rasmlar yuklanmoqda...");
        if (driver.selfie && driver.selfie.telegramFileId && adminBot.mainBot) {
            await sendPhotoByUrl(driver.selfie.telegramFileId, "👤 Haydovchi Rasmi", true);
        }

        if (driver.verificationDocuments && adminBot.mainBot) {
            const docs = driver.verificationDocuments;
            if (docs.licenseFront && docs.licenseFront.telegramFileId) {
                await sendPhotoByUrl(docs.licenseFront.telegramFileId, "👮‍♂️ Prava (Oldi)");
            }
            if (docs.licenseBack && docs.licenseBack.telegramFileId) {
                await sendPhotoByUrl(docs.licenseBack.telegramFileId, "👮‍♂️ Prava (Orqa)");
            }
            if (docs.passport && docs.passport.telegramFileId) {
                await sendPhotoByUrl(docs.passport.telegramFileId, "🛂 Pasport");
            }
        }

        if (driver.carImages && driver.carImages.length > 0 && adminBot.mainBot) {
            for (let i = 0; i < driver.carImages.length; i++) {
                await sendPhotoByUrl(driver.carImages[i].telegramFileId, `🚗 Mashina Rasmi #${i + 1}`);
            }
        }
        await ctx.answerCallbackQuery().catch(() => { });
        return;
    }

    // Granular Rejection Handlers
    if (data.startsWith("reject_selfie_")) {
        const userId = data.replace("reject_selfie_", "");
        const user = await User.findById(userId);
        if (user) {
            user.status = 'rejected';
            await user.save();
            try {
                if (adminBot.mainBot) {
                    await adminBot.mainBot.api.sendMessage(user.telegramId, "❌ Sizning akkauntingiz rad etildi.\n\nSabab: 📸 <b>Shaxsiy rasmingiz (Selfie) talabga javob bermaydi.</b>\n\nIltimos, qaytadan ariza topshiring:\n👉 <b>'🚖 Haydovchi'</b> tugmasini bosing.", { parse_mode: "HTML" });
                }
            } catch (e) { console.error(e) }
            await ctx.reply(`❌ ${user.name} rad etildi (Selfie Xato).`);
        }
        await ctx.answerCallbackQuery();
        return;
    }

    if (data.startsWith("reject_car_")) {
        const userId = data.replace("reject_car_", "");
        const user = await User.findById(userId);
        if (user) {
            user.status = 'rejected';
            await user.save();
            try {
                if (adminBot.mainBot) {
                    await adminBot.mainBot.api.sendMessage(user.telegramId, "❌ Sizning akkauntingiz rad etildi.\n\nSabab: 🚗 <b>Mashina rasmlari talabga javob bermaydi.</b>\n\nIltimos, qaytadan ariza topshiring:\n👉 <b>'🚖 Haydovchi'</b> tugmasini bosing.", { parse_mode: "HTML" });
                }
            } catch (e) { console.error(e) }
            await ctx.reply(`❌ ${user.name} rad etildi (Mashina Rasmi Xato).`);
        }
        await ctx.answerCallbackQuery();
        return;
    }

    // Back to Main Menu Handler from inline
    if (data === "drivers_menu") {
        await ctx.reply("📂 Qaysi toifadagi haydovchilarni ko'rmoqchisiz?", { reply_markup: adminMenu });
        await ctx.answerCallbackQuery();
        return;
    }

    // Admin Managing Orders
    if (data.startsWith("admin_delete_")) {
        const reqId = data.replace("admin_delete_", "");
        const req = await require("./models/RideRequest").findById(reqId);
        if (req) {
            req.status = 'cancelled';
            await req.save();
            await ctx.editMessageText("🗑 Bu buyurtma o'chirildi.");
        } else {
            await ctx.answerCallbackQuery("Buyurtma topilmadi.");
        }
        return;
    }

    if (data.startsWith("admin_rebroadcast_")) {
        const reqId = data.replace("admin_rebroadcast_", "");
        const req = await require("./models/RideRequest").findById(reqId);
        if (req) {
            try {
                const { broadcastRequest } = require("./utils/broadcastUtils");
                await ctx.answerCallbackQuery("🔄 Broadcast boshlandi...");
                // Force admin flag
                await broadcastRequest(adminBot.mainBot.api, req, { isAdmin: true });
                await ctx.reply("✅ Qayta broadcast qilindi!");
            } catch (e) {
                console.error(e);
                await ctx.reply("❌ Xatolik: " + e.message);
            }
        } else {
            await ctx.answerCallbackQuery("Buyurtma topilmadi.");
        }
        return;
    }

    await next();
});

// Notification Helper
adminBot.notifyAdmins = async (driverData) => {
    // ... existing ...
    const admins = await Admin.find({});
    const adminIds = admins.map(a => a.telegramId);
    if (config.ADMIN_ID && !adminIds.includes(parseInt(config.ADMIN_ID))) {
        adminIds.push(parseInt(config.ADMIN_ID));
    }

    const caption = `
🆕 <b>Yangi Haydovchi So'rovi</b>

👤 Ism: ${driverData.name}
🔢 ID: ${driverData.telegramId}
📞 Tel: ${driverData.phone}
🚗 Model: ${driverData.carDetails.model}
🔢 Nomer: ${driverData.carNumber || '-'}
🎨 Rang: ${driverData.carDetails.color}
📅 Yil: ${driverData.carDetails.year}
💺 Joy: ${driverData.carDetails.seats}

Tasdiqlaysizmi?
`;

    const keyboard = new InlineKeyboard()
        .text("✅ Tasdiqlash", `approve_${driverData._id}`)
        .text("❌ Rad etish", `decline_${driverData._id}`);
    // Add direct "View Photos" button in notification for convenience
    keyboard.row().text("📷 Rasmlarni ko'rish", `view_photos_${driverData._id}`);

    for (const id of adminIds) {
        try {
            await adminBot.api.sendMessage(id, caption, { parse_mode: "HTML", reply_markup: keyboard });
        } catch (e) {
            console.error(`Failed to notify admin ${id}:`, e.message);
        }
    }
};

adminBot.command("search", async (ctx) => {
    const query = ctx.match;
    if (!query) return ctx.reply("🔍 Qidirish uchun ID, Telefon yoki Mashina raqamini kiriting.\nMisol: /search 12345678");

    // Try finding by Telegram ID
    let driver = await User.findOne({ telegramId: query });

    // Try finding by Phone
    if (!driver) driver = await User.findOne({ phone: query });
    if (!driver) driver = await User.findOne({ phone: "+" + query });

    // Try finding by Car Number (Exact match, ignore case?)
    if (!driver) {
        // Regex for case insensitive
        driver = await User.findOne({ carNumber: { $regex: new RegExp("^" + query + "$", "i") } });
    }

    if (!driver) {
        return ctx.reply("❌ Haydovchi topilmadi.");
    }

    // Reuse display logic (DRY violation but simple here) - Send details
    // Ideally we define 'sendDriverDetails(ctx, driver)' function. 
    // For now, construct message manually.
    const caption = `
<b>🔍 Qidiruv Natijasi</b>

👤 Ism: ${driver.name}
🔢 ID: ${driver.telegramId}
📞 Tel: ${driver.phone}
🚗 Model: ${driver.carDetails ? driver.carDetails.model : driver.carModel}
🔢 Nomer: ${driver.carNumber || '-'}
🎨 Rang: ${driver.carDetails ? driver.carDetails.color : "-"}
📅 Yil: ${driver.carDetails ? driver.carDetails.year : "-"}
💺 Joy: ${driver.carDetails ? driver.carDetails.seats : "-"} 
📊 Status: ${driver.status}
`;

    const keyboard = new InlineKeyboard();
    if (driver.status === 'pending_verification') {
        keyboard.text("✅ Tasdiqlash", `approve_${driver._id}`).text("❌ Rad etish", `decline_${driver._id}`).row();
    } else if (driver.status === 'approved') {
        keyboard.text("❌ Bloklash", `decline_${driver._id}`).row();
    } else if (driver.status === 'rejected') {
        keyboard.text("✅ Qayta Tasdiqlash", `approve_${driver._id}`).row();
    }

    if (driver.selfie && driver.selfie.telegramFileId) {
        keyboard.row().text("📷 Rasmlarni ko'rish", `view_photos_${driver._id}`);
    }

    await ctx.reply(caption, { parse_mode: "HTML", reply_markup: keyboard });
});

adminBot.command("drivers", async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text("🕒 Kutilayotganlar", "drivers_list_pending_verification").row()
        .text("✅ Tasdiqlanganlar", "drivers_list_approved").row()
        .text("❌ Rad etilganlar", "drivers_list_rejected");

    await ctx.reply("📂 Qaysi toifadagi haydovchilarni ko'rmoqchisiz?", { reply_markup: keyboard });
});

module.exports = adminBot;
