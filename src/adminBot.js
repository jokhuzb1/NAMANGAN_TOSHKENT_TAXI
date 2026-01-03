
const { Bot, session, InlineKeyboard, Keyboard, InputFile } = require("grammy");
const config = require("./config");
const User = require("./models/User");
const Admin = require("./models/Admin");
const mongoose = require("mongoose");

if (!config.ADMIN_BOT_TOKEN) {
    console.error("⚠️  ADMIN_BOT_TOKEN is missing in .env or config.js");
}

const adminBot = new Bot(config.ADMIN_BOT_TOKEN || "FAKE_TOKEN_FOR_INIT_IF_MISSING");

// Middleware
adminBot.use(session({ initial: () => ({}) }));

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
    .text("🕒 Kutilayotganlar").text("✅ Tasdiqlanganlar")
    .row()
    .text("❌ Rad etilganlar").text("📣 Hammaga Xabar")
    .resized();

// Commands
adminBot.command("start", async (ctx) => {
    await ctx.reply(`👨‍✈️ Admin Paneliga xush kelibsiz, ${ctx.from.first_name} !\n\nYangi haydovchilar so'rovlari avtomatik ravishda shu yerga keladi.`, {
        reply_markup: adminMenu
    });
});

adminBot.command("add_admin", async (ctx) => {
    const id = parseInt(ctx.match);
    if (isNaN(id)) return ctx.reply("⚠️ ID noto'g'ri. Foydalanish: /add_admin 123456789");

    const exists = await Admin.findOne({ telegramId: id });
    if (exists) return ctx.reply("⚠️ Bu foydalanuvchi allaqachon admin.");

    await Admin.create({ telegramId: id, addedBy: ctx.from.id, name: "Unknown" });
    await ctx.reply(`✅ Admin qo'shildi (ID: ${id}).`);
});

adminBot.command("admins", async (ctx) => {
    const admins = await Admin.find({});
    let message = "<b>👨‍✈️ Adminlar Ro'yxati:</b>\n\n";

    // Add Super Admin from config
    const superAdminId = config.ADMIN_ID;
    if (superAdminId) {
        message += `👑 <b>Super Admin:</b> <code>${superAdminId}</code>\n`;
    }

    if (admins.length > 0) {
        message += "\n<b>Boshqa Adminlar:</b>\n";
        admins.forEach((admin, index) => {
            message += `${index + 1}. ${admin.name || "Noma'lum"} (ID: <code>${admin.telegramId}</code>)\n`;
        });
    } else {
        message += "\n<i>Boshqa adminlar yo'q.</i>";
    }

    await ctx.reply(message, { parse_mode: "HTML" });
});

// Reusable List Function
async function listDrivers(ctx, status, title) {
    const drivers = await User.find({ role: 'driver', status: status }).limit(10);
    let text = title + "\n\n";
    let keyboard = new InlineKeyboard();

    if (drivers.length === 0) {
        text += "<i>Hozircha bo'sh.</i>";
    } else {
        drivers.forEach(d => {
            keyboard.text(`${d.name} (${d.phone})`, `driver_info_${d._id}`).row();
        });
    }
    // No back button needed if using ReplyKeyboard menu

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

// Menu Handlers
adminBot.hears("🕒 Kutilayotganlar", async (ctx) => listDrivers(ctx, 'pending_verification', "🕒 <b>Kutilayotgan Haydovchilar:</b>"));
adminBot.hears("✅ Tasdiqlanganlar", async (ctx) => listDrivers(ctx, 'approved', "✅ <b>Tasdiqlangan Haydovchilar:</b>"));
adminBot.hears("❌ Rad etilganlar", async (ctx) => listDrivers(ctx, 'rejected', "❌ <b>Rad etilgan Haydovchilar:</b>"));

// Broadcast Handler
adminBot.hears("📣 Hammaga Xabar", async (ctx) => {
    ctx.session.step = 'broadcast';
    await ctx.reply("📢 <b>Xabarni yuboring:</b>\n\n(Matn, rasm, video yoki boshqa turdagi xabarni yuborishingiz mumkin).", {
        parse_mode: "HTML",
        reply_markup: {
            keyboard: [[{ text: "🔙 Bekor qilish" }]],
            resize_keyboard: true
        }
    });
});

adminBot.hears("🔙 Bekor qilish", async (ctx) => {
    ctx.session.step = null;
    await ctx.reply("❌ Xabar yuborish bekor qilindi.", { reply_markup: adminMenu });
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

    if (data.startsWith("approve_")) {
        const userId = data.replace("approve_", "");
        const user = await User.findById(userId);
        if (!user) return ctx.reply("⚠️ Foydalanuvchi topilmadi.");

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
                await adminBot.mainBot.api.sendMessage(user.telegramId, "✅ Tabriklaymiz! Sizning akkauntingiz tasdiqlandi. Endi buyurtmalarni qabul qilishingiz mumkin.");
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
        await ctx.answerCallbackQuery();
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
