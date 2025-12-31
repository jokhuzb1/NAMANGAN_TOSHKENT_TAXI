const { InlineKeyboard } = require("grammy");
const User = require("../models/User");
const keyboardsUtils = require("../utils/keyboards");

async function driverSettings(conversation, ctx) {
    // Helper to show main menu
    const showMainMenu = async (ctx) => {
        await ctx.reply("⚙️ <b>Sozlamalar</b>\n\nNiman o'zgartirmoqchisiz?", {
            reply_markup: new InlineKeyboard()
                .text("📸 Mashina Rasmlari", "settings_car_photos").row()
                .text("📝 Ma'lumotlarni Tahrirlash", "settings_edit_profile").row()
                .text("❌ Yopish", "settings_close"),
            parse_mode: "HTML"
        });
    };

    await showMainMenu(ctx);

    // Wait for choice
    while (true) {
        const submenuCtx = await conversation.waitFor("callback_query:data");
        const data = submenuCtx.callbackQuery.data;

        if (data === "settings_close") {
            await submenuCtx.answerCallbackQuery();
            await submenuCtx.deleteMessage();
            return;
        }

        if (data === "settings_car_photos") {
            await submenuCtx.answerCallbackQuery();
            await manageCarPhotos(conversation, submenuCtx);
            await showMainMenu(ctx);
        }

        if (data === "settings_edit_profile") {
            await submenuCtx.answerCallbackQuery();
            await manageProfile(conversation, submenuCtx);
            await showMainMenu(ctx);
        }
    }
}

const { driverRegister } = require("./registration");

async function passengerSettings(conversation, ctx) {
    // Show simple menu for passenger
    await ctx.reply("⚙️ <b>Sozlamalar (Yo'lovchi)</b>", {
        reply_markup: new InlineKeyboard()
            .text("🚕 Haydovchi bo'lish", "switch_to_driver").row()
            .text("❌ Yopish", "settings_close"),
        parse_mode: "HTML"
    });

    const submenuCtx = await conversation.waitFor("callback_query:data");
    const data = submenuCtx.callbackQuery.data;

    if (data === "settings_close") {
        await submenuCtx.answerCallbackQuery();
        await submenuCtx.deleteMessage();
        return;
    }

    if (data === "switch_to_driver") {
        await submenuCtx.answerCallbackQuery();
        await submenuCtx.deleteMessage();

        // Start Driver Registration by calling function directly
        // We need to import it first
        await driverRegister(conversation, submenuCtx);
    }
}

async function manageProfile(conversation, ctx) {
    while (true) {
        // Fetch current info
        const user = await conversation.external(() => User.findOne({ telegramId: ctx.from.id }).lean());
        const details = user.carDetails || {};

        const infoMsg = `
<b>📝 Profilni Tahrirlash</b>

👤 <b>Ism:</b> ${user.name || '-'}
🔢 <b>Mashina Raqami:</b> ${user.carNumber || '-'}
📞 <b>Telefon:</b> ${user.phone || '-'}
🚗 <b>Model:</b> ${details.model || user.carModel || '-'}
🎨 <b>Rang:</b> ${details.color || '-'}
📅 <b>Yil:</b> ${details.year || '-'}
`;
        await ctx.reply(infoMsg, {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard()
                .text("👤 Ism", "edit_profile_name")
                .text("📞 Telefon", "edit_profile_phone").row()
                .text("🚗 Model", "edit_profile_model")
                .text("🎨 Rang", "edit_profile_color")
                .text("📅 Yil", "edit_profile_year").row()
                .text("🔢 Mashina Raqami", "edit_profile_carnumber").row()
                .text("🔙 Orqaga", "back_to_settings_main")
        });

        const actionCtx = await conversation.waitFor("callback_query:data");
        const action = actionCtx.callbackQuery.data;
        await actionCtx.answerCallbackQuery();

        if (action === "back_to_settings_main") {
            return;
        }

        if (action === "edit_profile_name") {
            await ctx.reply("✏️ Yangi ismingizni yozing:");
            const { message } = await conversation.waitFor("message:text");
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { name: message.text });
            });
            await ctx.reply("✅ Ism yangilandi!");

        } else if (action === "edit_profile_carnumber") {
            await ctx.reply("✏️ Yangi mashina raqamini yozing (masalan: 01 A 000 AA):");
            const { message } = await conversation.waitFor("message:text");
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { carNumber: message.text });
            });
            await ctx.reply("✅ Mashina raqami yangilandi!");

        } else if (action === "edit_profile_phone") {
            await ctx.reply("📞 Yangi telefon raqamini yozing:");
            const { message } = await conversation.waitFor("message:text");
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { phone: message.text });
            });
            await ctx.reply("✅ Telefon raqami yangilandi!");

        } else if (action === "edit_profile_model") {
            await ctx.reply("🚗 Yangi mashina modelini yozing (masalan: Gentra):");
            const { message } = await conversation.waitFor("message:text");
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { "carDetails.model": message.text, "carModel": message.text });
            });
            await ctx.reply("✅ Mashina modeli yangilandi!");

        } else if (action === "edit_profile_color") {
            await ctx.reply("🎨 Yangi mashina rangini yozing (masalan: Oq):");
            const { message } = await conversation.waitFor("message:text");
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { "carDetails.color": message.text });
            });
            await ctx.reply("✅ Mashina rangi yangilandi!");

        } else if (action === "edit_profile_year") {
            await ctx.reply("📅 Mashina yilini yozing (masalan: 2023):");
            const { message } = await conversation.waitFor("message:text");
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { "carDetails.year": message.text });
            });
            await ctx.reply("✅ Mashina yili yangilandi!");
        }
    }
}

async function manageCarPhotos(conversation, ctx) {
    while (true) {
        // Fetch fresh user data (Return only needed POJO data)
        const carImages = await conversation.external(async () => {
            const u = await User.findOne({ telegramId: ctx.from.id });
            // Return plain object array, manually mapped to ensure safety
            return (u.carImages || []).map(img => ({
                telegramFileId: img.telegramFileId,
                telegramFileUniqueId: img.telegramFileUniqueId
            }));
        });

        // 1. List Photos one by one
        if (carImages.length === 0) {
            await ctx.reply("📂 Sizda hozircha mashina rasmlari yo'q.");
        } else {
            await ctx.reply(`📂 <b>Sizning rasmlaringiz (${carImages.length}/3):</b>`, { parse_mode: "HTML" });

            // Loop and send
            for (let i = 0; i < carImages.length; i++) {
                const img = carImages[i];
                await ctx.replyWithPhoto(img.telegramFileId, {
                    caption: `Rasm #${i + 1}`,
                    reply_markup: new InlineKeyboard().text("🗑 O'chirish", `delete_photo_${i}`)
                });
            }
        }

        // 2. Show Actions Menu (Add, Back)
        const menuKb = new InlineKeyboard();
        if (carImages.length < 3) {
            menuKb.text("➕ Rasm qo'shish", "add_photo").row();
        }
        menuKb.text("🔙 Orqaga", "back_to_settings");

        await ctx.reply("👇 Amalni tanlang:", { reply_markup: menuKb });

        // 3. Wait for Action
        const actionCtx = await conversation.waitFor(["callback_query:data", "message:photo"]);

        // Handle Button Clicks
        if (actionCtx.callbackQuery) {
            const action = actionCtx.callbackQuery.data;
            await actionCtx.answerCallbackQuery();

            if (action === "back_to_settings") {
                // Clean up menu?
                return;
            }

            if (action === "add_photo") {
                await ctx.reply("📸 Yangi rasmni yuboring (faqat rasm):");
                const photoCtx = await conversation.waitFor("message:photo");
                const newPhoto = photoCtx.message.photo[photoCtx.message.photo.length - 1];

                // Save
                await conversation.external(async () => {
                    const u = await User.findOne({ telegramId: ctx.from.id });
                    if (!u) return; // Should not happen
                    if (!u.carImages) u.carImages = [];

                    // FIFO Logic: if 3, remove first (oldest), push new
                    if (u.carImages.length >= 3) {
                        u.carImages.shift(); // Remove oldest
                    }
                    u.carImages.push({
                        telegramFileId: newPhoto.file_id,
                        telegramFileUniqueId: newPhoto.file_unique_id,
                        uploadedAt: new Date()
                    });
                    await u.save();
                });
                await ctx.reply("✅ Rasm saqlandi!");
                continue; // Loop refreshes list
            }

            if (action.startsWith("delete_photo_")) {
                const index = parseInt(action.replace("delete_photo_", ""));

                await conversation.external(async () => {
                    const u = await User.findOne({ telegramId: ctx.from.id });
                    if (u && u.carImages && u.carImages[index]) {
                        u.carImages.splice(index, 1);
                        await u.save();
                    }
                });
                await ctx.reply("🗑 Rasm o'chirildi.");
                continue; // Loop refreshes list
            }
        } else {
            // If user sent a photo directly without clicking Add? 
            // We can ignore or handle. Let's ignore to prevent accidental uploads.
            await ctx.reply("⚠️ Iltimos, tugmalardan foydalaning.");
        }
    }
}

module.exports = { driverSettings, passengerSettings };
