const { InlineKeyboard } = require("grammy");
const User = require("../models/User");
const keyboardsUtils = require("../utils/keyboards");
const dynamicKeyboards = require("../utils/keyboardsDynamic");
const { t } = require("../utils/i18n_fixed");

async function driverSettings(conversation, ctx) {
    // Helper to show main menu
    // Helper to show main menu
    const showMainMenu = async (ctx) => {
        const user = await conversation.external(() => User.findOne({ telegramId: ctx.from.id }));
        const lang = user.language || 'uz_cyrillic';

        await ctx.reply("⚙️ <b>" + t('settings', lang) + "</b>", {
            reply_markup: new InlineKeyboard()
                .text("📸 " + (lang === 'uz_latin' ? "Mashina Rasmlari" : "Машина Расмлари"), "settings_car_photos").row()
                .text("📝 " + (lang === 'uz_latin' ? "Ma'lumotlarni Tahrirlash" : "Маълумотларни Таҳрирлаш"), "settings_edit_profile").row()
                .text("🌐 " + (lang === 'uz_latin' ? "Tilni o'zgartirish" : "Тилни ўзгартириш"), "settings_language").row()
                .text("❌ " + t('cancel', lang), "settings_close"),
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

        if (data === "settings_language") {
            await submenuCtx.answerCallbackQuery();
            await manageLanguage(conversation, submenuCtx);
            await showMainMenu(ctx);
        }
    }
}

const { driverRegister } = require("./registration");

async function passengerSettings(conversation, ctx) {
    // Passenger Settings
    const user = await conversation.external(() => User.findOne({ telegramId: ctx.from.id }));
    const lang = user.language || 'uz_cyrillic';

    await ctx.reply("⚙️ <b>" + t('settings', lang) + "</b>", {
        reply_markup: new InlineKeyboard()
            .text("🚕 " + (lang === 'uz_latin' ? "Haydovchi bo'lish" : "Ҳайдовчи бўлиш"), "switch_to_driver").row()
            .text("🌐 " + (lang === 'uz_latin' ? "Tilni o'zgartirish" : "Тилни ўзгартириш"), "settings_language").row()
            .text("❌ " + t('cancel', lang), "settings_close"),
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

    if (data === "settings_language") {
        await submenuCtx.answerCallbackQuery();
        await manageLanguage(conversation, submenuCtx);
    }
}

async function manageLanguage(conversation, ctx) {
    await ctx.reply("🌐 Tilni tanlang:", {
        reply_markup: new InlineKeyboard()
            .text("🇺🇿 O'zbekcha (Lotin)", "lang_uz_latin").row()
            .text("🇺🇿 Ўзбекча (Кирилл)", "lang_uz_cyrillic").row()
            .text("🔙 Orqaga", "back_lang")
    });

    const response = await conversation.waitFor("callback_query:data");
    const data = response.callbackQuery.data;

    if (data === "back_lang") {
        await response.answerCallbackQuery();
        await response.deleteMessage();
        return;
    }

    let lang = 'uz_latin';
    if (data === "lang_uz_cyrillic") lang = 'uz_cyrillic';

    await conversation.external(async () => {
        await User.updateOne({ telegramId: ctx.from.id }, { language: lang });
    });

    await response.answerCallbackQuery("✅");
    await response.deleteMessage();

    const userForKb = await conversation.external(async () => {
        return await User.findOne({ telegramId: ctx.from.id });
    });

    let kb;
    if (userForKb.role === 'passenger') {
        kb = dynamicKeyboards.getPassengerMenu(lang);
    } else if (userForKb.role === 'driver') {
        kb = dynamicKeyboards.getDriverMenu(lang, userForKb.isOnline, userForKb.activeRoute !== 'none');
    } else {
        kb = dynamicKeyboards.getRoleSelection(lang);
    }

    await ctx.reply(t('welcome', lang), { reply_markup: kb });
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
