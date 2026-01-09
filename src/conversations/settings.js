const { InlineKeyboard } = require("grammy");
const User = require("../models/User");
const keyboardsUtils = require("../utils/keyboards");
const dynamicKeyboards = require("../utils/keyboardsDynamic");
const { t } = require("../utils/i18n");

function isGlobalCommand(text) {
    if (!text) return false;
    const globalPrefixes = ['/', '🚖', '🚕', '📦', '👀', '⚙️', '🟢', '🔴', '📡', '🏁', '✅', '👤', '🔙'];
    return globalPrefixes.some(p => text.startsWith(p));
}

async function driverSettings(conversation, ctx) {
    // Helper to show main menu
    // Helper to show main menu
    const showMainMenu = async (ctx) => {
        const user = await conversation.external(() => User.findOne({ telegramId: ctx.from.id }).lean());
        const lang = user?.language || 'uz_cyrillic';

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
    const user = await conversation.external(() => User.findOne({ telegramId: ctx.from.id }).lean());
    const lang = user?.language || 'uz_cyrillic';

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

    // Extract only primitive values to avoid DataCloneError (Mongoose docs can't be structuredCloned)
    const userForKb = await conversation.external(async () => {
        const u = await User.findOne({ telegramId: ctx.from.id });
        if (!u) return null;
        return {
            role: u.role,
            isOnline: u.isOnline,
            activeRoute: u.activeRoute
        };
    });

    let kb;
    if (userForKb && userForKb.role === 'passenger') {
        kb = dynamicKeyboards.getPassengerMenu(lang);
    } else if (userForKb && userForKb.role === 'driver') {
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
        const formattedPhone = user.phone ? (user.phone.startsWith('+') ? user.phone : '+' + user.phone) : '-';

        const infoMsg = `
<b>📝 Профилни Таҳрирлаш</b>

👤 <b>Исм:</b> ${user.name || '-'}
🔢 <b>Машина Рақами:</b> ${user.carNumber || '-'}
📞 <b>Телефон:</b> ${formattedPhone}
🚗 <b>Модел:</b> ${details.model || user.carModel || '-'}
🎨 <b>Ранг:</b> ${details.color || '-'}
📅 <b>Йил:</b> ${details.year || '-'}
`;
        await ctx.reply(infoMsg, {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard()
                .text("📸 Расмимни янгилаш", "edit_profile_selfie").row()
                .text("👤 Исм", "edit_profile_name")
                .text("📞 Телефон", "edit_profile_phone").row()
                .text("🚗 Модел", "edit_profile_model")
                .text("🎨 Ранг", "edit_profile_color")
                .text("📅 Йил", "edit_profile_year").row()
                .text("🔢 Машина Рақами", "edit_profile_carnumber").row()
                .text("🔙 Орқага", "back_to_settings_main")
        });

        const actionCtx = await conversation.waitFor("callback_query:data");
        const action = actionCtx.callbackQuery.data;
        await actionCtx.answerCallbackQuery();

        if (action === "back_to_settings_main") {
            return;
        }

        if (action === "edit_profile_name") {
            await ctx.reply("✏️ Янги исмингизни ёзинг:");
            const response = await conversation.waitFor(["message:text", "callback_query:data"]);
            if (response.callbackQuery || (response.message && isGlobalCommand(response.message.text))) {
                // Cancelled
                if (response.callbackQuery) await response.answerCallbackQuery();
                await ctx.reply("❌ Амал бекор қилинди.");
                continue;
            }
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { name: response.message.text });
            });
            await ctx.reply("✅ Исм янгиланди!");

        } else if (action === "edit_profile_carnumber") {
            await ctx.reply("✏️ Янги машина рақамини ёзинг (масалан: 01 A 000 AA):");
            const response = await conversation.waitFor(["message:text", "callback_query:data"]);
            if (response.callbackQuery || (response.message && isGlobalCommand(response.message.text))) {
                if (response.callbackQuery) await response.answerCallbackQuery();
                await ctx.reply("❌ Амал бекор қилинди.");
                continue;
            }
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { carNumber: response.message.text });
            });
            await ctx.reply("✅ Машина рақами янгиланди!");

        } else if (action === "edit_profile_phone") {
            await ctx.reply("📞 Янги телефон рақамини ёзинг:");
            const response = await conversation.waitFor(["message:text", "callback_query:data"]);
            if (response.callbackQuery || (response.message && isGlobalCommand(response.message.text))) {
                if (response.callbackQuery) await response.answerCallbackQuery();
                await ctx.reply("❌ Амал бекор қилинди.");
                continue;
            }
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { phone: response.message.text });
            });
            await ctx.reply("✅ Телефон рақами янгиланди!");

        } else if (action === "edit_profile_model") {
            await ctx.reply("🚗 Янги машина моделини ёзинг (масалан: Gentra):");
            const response = await conversation.waitFor(["message:text", "callback_query:data"]);
            if (response.callbackQuery || (response.message && isGlobalCommand(response.message.text))) {
                if (response.callbackQuery) await response.answerCallbackQuery();
                await ctx.reply("❌ Амал бекор қилинди.");
                continue;
            }
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { "carDetails.model": response.message.text, "carModel": response.message.text });
            });
            await ctx.reply("✅ Машина модели янгиланди!");

        } else if (action === "edit_profile_color") {
            await ctx.reply("🎨 Янги машина рангини ёзинг (масалан: Оқ):");
            const response = await conversation.waitFor(["message:text", "callback_query:data"]);
            if (response.callbackQuery || (response.message && isGlobalCommand(response.message.text))) {
                if (response.callbackQuery) await response.answerCallbackQuery();
                await ctx.reply("❌ Амал бекор қилинди.");
                continue;
            }
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { "carDetails.color": response.message.text });
            });
            await ctx.reply("✅ Машина ранги янгиланди!");

        } else if (action === "edit_profile_selfie") {
            await ctx.reply("📸 Янги расмни юборинг (Селфи):");
            const response = await conversation.waitFor(["message:photo", "callback_query:data"]);
            if (response.callbackQuery || (response.message && response.message.text && response.message.text.startsWith('/'))) {
                if (response.callbackQuery) await response.answerCallbackQuery();
                await ctx.reply("❌ Амал бекор қилинди.");
                continue;
            }
            if (!response.message || !response.message.photo) {
                await ctx.reply("⚠️ Илтимос, расм юборинг.");
                continue;
            }
            const newPhoto = response.message.photo[response.message.photo.length - 1];
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, {
                    selfie: {
                        telegramFileId: newPhoto.file_id,
                        telegramFileUniqueId: newPhoto.file_unique_id,
                        uploadedAt: new Date()
                    }
                });
            });
            await ctx.reply("✅ Расм янгиланди!");

        } else if (action === "edit_profile_year") {
            await ctx.reply("📅 Машина йилини ёзинг (масалан: 2023):");
            const response = await conversation.waitFor(["message:text", "callback_query:data"]);
            if (response.callbackQuery || (response.message && isGlobalCommand(response.message.text))) {
                if (response.callbackQuery) await response.answerCallbackQuery();
                await ctx.reply("❌ Амал бекор қилинди.");
                continue;
            }
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, { "carDetails.year": response.message.text });
            });
            await ctx.reply("✅ Машина йили янгиланди!");
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
            await ctx.reply("📂 Сизда ҳозирча машина расмлари йўқ.");
        } else {
            await ctx.reply(`📂 <b>Сизнинг расмларингиз (${carImages.length}/3):</b>`, { parse_mode: "HTML" });

            // Loop and send
            for (let i = 0; i < carImages.length; i++) {
                const img = carImages[i];
                await ctx.replyWithPhoto(img.telegramFileId, {
                    caption: `Расм #${i + 1}`,
                    reply_markup: new InlineKeyboard().text("🗑 Ўчириш", `delete_photo_${i}`)
                });
            }
        }

        // 2. Show Actions Menu (Add, Back)
        const menuKb = new InlineKeyboard();
        if (carImages.length < 3) {
            menuKb.text("➕ Расм қўшиш", "add_photo").row();
        }
        menuKb.text("🔙 Орқага", "back_to_settings");

        await ctx.reply("👇 Амални танланг:", { reply_markup: menuKb });

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
                await ctx.reply("📸 Янги расмни юборинг (фақат расм):");
                const photoCtx = await conversation.waitFor(["message:photo", "callback_query:data", "message:text"]);

                if (photoCtx.callbackQuery || (photoCtx.message && photoCtx.message.text && isGlobalCommand(photoCtx.message.text))) {
                    if (photoCtx.callbackQuery) await photoCtx.answerCallbackQuery();
                    await ctx.reply("❌ Амал бекор қилинди.");
                    continue;
                }

                if (!photoCtx.message || !photoCtx.message.photo) {
                    await ctx.reply("⚠️ Илтимос, фақат расм юборинг.");
                    continue;
                }
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
                await ctx.reply("✅ Расм сақланди!");
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
                await ctx.reply("🗑 Расм ўчирилди.");
                continue; // Loop refreshes list
            }
        } else {
            // If user sent a photo directly without clicking Add? 
            // We can ignore or handle. Let's ignore to prevent accidental uploads.
            await ctx.reply("⚠️ Илтимос, тугмалардан фойдаланинг.");
        }
    }
}

module.exports = { driverSettings, passengerSettings };
