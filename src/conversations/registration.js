const { keyboards } = require("../utils/keyboards");
const User = require("../models/User");
const keyboardsUtils = require("../utils/keyboards");
const adminBot = require("../adminBot");
const { t } = require("../utils/i18n_fixed");

async function passengerRegister(conversation, ctx) {
    // 1. Ask for Phone
    await ctx.reply("Илтимос, телефон рақамингизни юборинг:", { reply_markup: keyboardsUtils.requestContact });

    const responseCtx = await conversation.waitFor(["message:contact", "message:text"]);
    const msgText = responseCtx.message?.text || "";

    // Check for cancel (both Latin and Cyrillic)
    if (msgText === t('cancel', 'uz_latin') || msgText === t('cancel', 'uz_cyrillic')) {
        await ctx.reply("❌ Рўйхатдан ўтиш бекор қилинди.\n\nИлтимос, ролингизни танланг:", { reply_markup: keyboardsUtils.roleSelection });
        return;
    }

    if (!responseCtx.message.contact) {
        await ctx.reply("Илтимос, телефон рақам тугмасини босинг ёки бекор қилинг.", { reply_markup: keyboardsUtils.requestContact });
        return; // Simple exit for now or we could loop, but let's just return to avoid stuck state
    }

    let phone = responseCtx.message.contact.phone_number;

    // Save to DB
    await conversation.external(async () => {
        let user = await User.findOne({ telegramId: ctx.from.id });
        if (!user) {
            user = new User({ telegramId: ctx.from.id });
        }
        user.role = 'passenger';
        user.phone = phone;
        user.name = ctx.from.first_name;
        await user.save();
    });

    await ctx.reply("✅ Рўйхатдан ўтдингиз! Қаерга борамиз?", { reply_markup: keyboardsUtils.passengerMenu });
}

async function driverRegister(conversation, ctx) {
    // Initial fetch of state
    let state = await conversation.external(async () => {
        let u = await User.findOne({ telegramId: ctx.from.id });
        if (!u) {
            u = new User({ telegramId: ctx.from.id });
            await u.save();
        }
        // Ensure strictly POJO return to avoid DataCloneError
        const regData = u.registrationData ? JSON.parse(JSON.stringify(u.registrationData)) : {};
        return { step: u.registrationStep || 0, data: regData };
    });

    let step = state.step;
    let data = state.data;

    // Restore or Ask
    if (step > 0) {
        await ctx.reply("Siz avval ro'yxatdan o'tishni boshlagan edingiz. Davom ettiramizmi?", {
            reply_markup: {
                keyboard: [[{ text: "✅ Davom ettirish" }, { text: "🔁 Boshqatdan" }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        const answer = await conversation.waitFor("message:text");

        if (answer.message.text.includes("Boshqatdan")) {
            step = 0;
            data = {};
            // Clear DB state
            await conversation.external(async () => {
                await User.updateOne({ telegramId: ctx.from.id }, {
                    registrationStep: 0,
                    registrationData: {}
                });
            });
            await ctx.reply("🔄 Ro'yxatdan o'tish qaytadan boshlandi.");
        } else {
            await ctx.reply("✅ Davom ettiramiz...");
        }
    }

    // Step 1: Phone
    let phone = data.phone;
    if (step < 1) {
        await ctx.reply("🚖 Ҳайдовчи бўлиб ишлаш учун телефон рақамингизни юборинг:", { reply_markup: keyboardsUtils.requestContact });
        const phoneCtx = await conversation.waitFor(["message:contact", "message:text"]);
        const phoneText = phoneCtx.message?.text || "";

        // Check for cancel (both Latin and Cyrillic)
        if (phoneText === t('cancel', 'uz_latin') || phoneText === t('cancel', 'uz_cyrillic')) {
            await ctx.reply("❌ Рўйхатдан ўтиш бекор қилинди.\n\nИлтимос, ролингизни танланг:", { reply_markup: keyboardsUtils.roleSelection });
            return;
        }

        if (!phoneCtx.message.contact) {
            await ctx.reply("Илтимос, телефон рақам тугмасини босинг.", { reply_markup: keyboardsUtils.requestContact });
            return;
        }

        phone = phoneCtx.message.contact.phone_number;

        data.phone = phone;
        step = 1;

        // Save state
        await conversation.external(async () => {
            await User.updateOne({ telegramId: ctx.from.id }, {
                registrationStep: 1,
                registrationData: data
            });
        });
    }

    // Step 2: Selfie
    let selfiePhoto = data.selfie;
    if (step < 2) {
        await ctx.reply("✅ Telefon raqam qabul qilindi.\n\n📸 Endi, iltimos, o'zingizning aniq tushirilgan selfi rasmingizni yuboring (Yuzingiz aniq ko'rinsin):",
            { reply_markup: { remove_keyboard: true } });

        const selfieCtx = await conversation.waitFor("message:photo");
        const photo = selfieCtx.message.photo[selfieCtx.message.photo.length - 1];
        selfiePhoto = { telegramFileId: photo.file_id, telegramFileUniqueId: photo.file_unique_id };

        data.selfie = selfiePhoto;
        step = 2;

        await conversation.external(async () => {
            await User.updateOne({ telegramId: ctx.from.id }, {
                registrationStep: 2,
                registrationData: data
            });
        });
    }

    // Step 3: Car Model
    let carModel = data.carModel;
    if (step < 3) {
        await ctx.reply("✅ Sizning rasmingiz qabul qilindi.\n\n🚗 Mashinangiz modelini tanlang:", { reply_markup: keyboardsUtils.carModels });
        const modelCtx = await conversation.waitForCallbackQuery(["car_gentra", "car_cobalt", "car_nexia3", "car_spark", "car_other"]);
        carModel = modelCtx.callbackQuery.data.replace("car_", "");
        await modelCtx.answerCallbackQuery();

        data.carModel = carModel;
        step = 3;

        await conversation.external(async () => {
            await User.updateOne({ telegramId: ctx.from.id }, {
                registrationStep: 3,
                registrationData: data
            });
        });
    }

    // Step 4: Color
    let color = data.color;
    if (step < 4) {
        await ctx.reply("🎨 Mashina rangini yozing (masalan: Oq):");
        const colorCtx = await conversation.waitFor("message:text");
        color = colorCtx.message.text;

        data.color = color;
        step = 4;

        await conversation.external(async () => {
            await User.updateOne({ telegramId: ctx.from.id }, {
                registrationStep: 4,
                registrationData: data
            });
        });
    }

    // Step 5: Year
    let year = data.year;
    if (step < 5) {
        await ctx.reply("📅 Mashina yilini yozing (masalan: 2022):");
        const yearCtx = await conversation.waitFor("message:text");
        year = yearCtx.message.text;

        data.year = year;
        step = 5;

        await conversation.external(async () => {
            await User.updateOne({ telegramId: ctx.from.id }, {
                registrationStep: 5,
                registrationData: data
            });
        });
    }

    // Step 6: Seats
    let seats = data.seats;
    if (step < 6) {
        await ctx.reply("💺 Mashina o'rindiqlari soni (masalan: 4):");
        const seatCtx = await conversation.waitFor("message:text");
        seats = parseInt(seatCtx.message.text);
        if (isNaN(seats)) seats = 4; // Fallback

        data.seats = seats;
        step = 6;

        await conversation.external(async () => {
            await User.updateOne({ telegramId: ctx.from.id }, {
                registrationStep: 6,
                registrationData: data
            });
        });
    }

    // Step 7: Car Images (Loop)
    let carImages = data.carImages || [];

    // Resume logic: mention existing images if any
    if (step < 7) {
        const msgText = carImages.length > 0
            ? `🚙 Qolgan mashina rasmlarini yuboring (Hozirda: ${carImages.length}/4).`
            : "🚙 Endi mashinangiz rasmlarini yuboring (Oldi, Orqa, Yon, Salon).\n\nJami 4 ta rasm kerak. Rasmlarni bittalab yoki birdaniga (album qilib) yuborishingiz mumkin.";

        await ctx.reply(msgText, {
            reply_markup: {
                keyboard: [[{ text: "✅ Yuklab bo'ldim" }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });

        while (carImages.length < 4) {
            const nextCtx = await conversation.waitFor("message");
            const msg = nextCtx.message;

            if (msg.photo) {
                const img = msg.photo[msg.photo.length - 1];
                const newImage = {
                    telegramFileId: img.file_id,
                    telegramFileUniqueId: img.file_unique_id,
                    uploadedAt: new Date() // Date might be tricky to clone if not simple JSON, but usually Date is fine. 
                    // If error persists, store as ISO string.
                };
                carImages.push(newImage);

                // Save immediately
                data.carImages = carImages;
                await conversation.external(async () => {
                    await User.updateOne({ telegramId: ctx.from.id }, {
                        registrationData: data
                    });
                });

                await ctx.reply(`✅ Rasm ${carImages.length}/4 qabul qilindi.`);

                if (carImages.length === 4) {
                    break;
                }
            } else if (msg.text === "✅ Yuklab bo'ldim") {
                if (carImages.length === 0) {
                    await ctx.reply("⚠️ Hech bo'lmasa bitta rasm yuklashingiz kerak.");
                } else {
                    break;
                }
            } else {
                await ctx.reply("⚠️ Iltimos, rasm yuboring yoki '✅ Yuklab bo'ldim' tugmasini bosing.");
            }
        }

        step = 7;
        await conversation.external(async () => {
            await User.updateOne({ telegramId: ctx.from.id }, {
                registrationStep: 7
            });
        });
    }

    // Step 8: License Front
    let licenseFront = data.licenseFront;
    if (step < 8) {
        await ctx.reply("👮‍♂️ <b>Guvohnoma (Prava) - Old tarafi</b>\n\nIltimos, haydovchilik guvohnomangizning old tarafini rasmga olib yuboring.", { parse_mode: "HTML", reply_markup: { remove_keyboard: true } });
        const imgCtx = await conversation.waitFor("message:photo");
        const photo = imgCtx.message.photo[imgCtx.message.photo.length - 1];
        licenseFront = { telegramFileId: photo.file_id };
        data.licenseFront = licenseFront;

        step = 8;
        await conversation.external(async () => {
            await User.updateOne({ telegramId: ctx.from.id }, { registrationStep: 8, registrationData: data });
        });
    }

    // Step 9: License Back
    let licenseBack = data.licenseBack;
    if (step < 9) {
        await ctx.reply("👮‍♂️ <b>Guvohnoma (Prava) - Orqa tarafi</b>\n\nIltimos, haydovchilik guvohnomangizning orqa tarafini rasmga olib yuboring.", { parse_mode: "HTML" });
        const imgCtx = await conversation.waitFor("message:photo");
        const photo = imgCtx.message.photo[imgCtx.message.photo.length - 1];
        licenseBack = { telegramFileId: photo.file_id };
        data.licenseBack = licenseBack;

        step = 9;
        await conversation.external(async () => {
            await User.updateOne({ telegramId: ctx.from.id }, { registrationStep: 9, registrationData: data });
        });
    }

    // Step 10: Passport
    let passport = data.passport;
    if (step < 10) {
        await ctx.reply("🛂 <b>Pasport Rasmi</b>\n\nIltimos, pasportingizning asosiy sahifasini (rasm bor joyi) aniq qilib yuboring.", { parse_mode: "HTML" });
        const imgCtx = await conversation.waitFor("message:photo");
        const photo = imgCtx.message.photo[imgCtx.message.photo.length - 1];
        passport = { telegramFileId: photo.file_id };
        data.passport = passport;

        step = 10;
        await conversation.external(async () => {
            await User.updateOne({ telegramId: ctx.from.id }, { registrationStep: 10, registrationData: data });
        });
    }

    // Finalize
    await conversation.external(async () => {
        const u = await User.findOne({ telegramId: ctx.from.id });
        if (u) {
            u.role = 'driver';
            u.phone = data.phone;
            u.name = ctx.from.first_name;
            u.username = ctx.from.username;

            u.carDetails = {
                brand: "Chevrolet",
                model: data.carModel,
                color: data.color,
                year: data.year,
                seats: data.seats
            };
            u.carModel = data.carModel; // Legacy

            u.selfie = data.selfie;

            // Fix Date objects if they became strings during JSON serialization/deserialization by chance
            // (Though structuredClone handles Date usually)
            u.carImages = data.carImages;

            u.verificationDocuments = {
                licenseFront: data.licenseFront,
                licenseBack: data.licenseBack,
                passport: data.passport
            };

            u.status = 'pending_verification';
            u.registrationStep = 0;
            u.registrationData = {};

            await u.save();
            await adminBot.notifyAdmins(u);
        }
    });

    await ctx.reply("✅ So'rov yuborildi! Admin tekshiruvidan keyin sizga xabar beriladi.", { reply_markup: { remove_keyboard: true } });
}

module.exports = { passengerRegister, driverRegister };
