const RideRequest = require("../models/RideRequest");
const User = require("../models/User");
const keyboardsUtils = require("../utils/keyboards");
const { Keyboard } = require("grammy");

async function parcelRequestConversation(conversation, ctx) {
    let step = 1;
    const state = {};

    while (step <= 6) {
        // Common Handler for Cancel
        const handleCommonActions = async (text) => {
            if (text === "❌ Бекор қилиш") {
                await ctx.reply("❌ Почта юбориш бекор қилинди.", { reply_markup: keyboardsUtils.passengerMenu });
                return "CANCEL";
            }
            if (text === "⬅️ Орқага") {
                return "BACK";
            }
            return null;
        };

        // Step 1: Route
        if (step === 1) {
            await ctx.reply("📦 Почта юбориш учун йўналишни танланг:", { reply_markup: keyboardsUtils.routeSelectionReply });
            const response = await conversation.waitFor("message:text");
            const text = response.message.text;

            const action = await handleCommonActions(text);
            if (action === "CANCEL") return;

            if (text.includes("Тошкент ➡️ Наманган")) {
                state.from = "Tashkent";
                state.to = "Namangan";
                state.routeData = "route_tash_nam";
            } else if (text.includes("Наманган ➡️ Тошкент")) {
                state.from = "Namangan";
                state.to = "Tashkent";
                state.routeData = "route_nam_tash";
            } else {
                continue;
            }
            step = 2;
        }
        // Step 2: Time
        else if (step === 2) {
            await ctx.reply("⏰ Қачон юборасиз?", { reply_markup: keyboardsUtils.parcelTimeSelectionReply });
            const response = await conversation.waitFor("message:text");
            const text = response.message.text;

            const action = await handleCommonActions(text);
            if (action === "CANCEL") return;
            if (action === "BACK") { step = 1; continue; }

            // Normalize "Tayyor pochta/yuk" to standard if needed, or keep as is.
            state.readableTime = text;
            step = 3;
        }
        // Step 3: Package Type
        else if (step === 3) {
            await ctx.reply("📦 Нима юбормоқчисиз?", { reply_markup: keyboardsUtils.packageTypeSelectionReply });
            const response = await conversation.waitFor("message:text");
            const text = response.message.text;

            const action = await handleCommonActions(text);
            if (action === "CANCEL") return;
            if (action === "BACK") { step = 2; continue; }

            state.packageTypeRaw = text; // Save original

            // Clean up emojis using simple check
            let cleanText = text;
            if (text.includes("Документ")) state.packageType = "Документ";
            else if (text.includes("Коробка")) state.packageType = "Коробка";
            else if (text.includes("Юк")) state.packageType = "Юк";
            else state.packageType = "Бошқа";

            step = 4;
        }
        // Step 4: Location Details (Text or Voice)
        else if (step === 4) {
            const kb = new Keyboard()
                .text("⬅️ Орқага").text("❌ Бекор қилиш")
                .resized();

            await ctx.reply(`🚩 <b>Почта ҳақида қўшимча маълумот:</b>\n\nМасалан: <i>"Қаердан олиб кетиш ва кимга бериш, юк оғирлиги..."</i>\n\nЁзишингиз ёки <b>Овозли хабар</b> юборишингиз мумкин.`, {
                parse_mode: "HTML",
                reply_markup: kb
            });

            const response = await conversation.waitFor(["message:text", "message:voice"]);

            if (response.message.text) {
                const text = response.message.text;
                const action = await handleCommonActions(text);
                if (action === "CANCEL") return;
                if (action === "BACK") { step = 3; continue; }

                state.district = text;
                state.voiceId = null;
                step = 5;

            } else if (response.message.voice) {
                state.district = "🔊 Овозли хабар";
                state.voiceId = response.message.voice.file_id;
                step = 5;
            }
        }
        // Step 5: Image Upload
        else if (step === 5) {
            const kb = new Keyboard()
                .text("➡️ Ўтказиб юбориш").text("⬅️ Орқага").text("❌ Бекор қилиш")
                .resized();

            await ctx.reply(`📸 <b>Почта расмини юкланг</b> (Ихтиёрий)\n\nБу ҳайдовчига юкни тушунишга ва ишончни оширишга ёрдам беради.`, {
                parse_mode: "HTML",
                reply_markup: kb
            });

            const response = await conversation.waitFor(["message:photo", "message:text"]);

            if (response.message.photo) {
                // Get highest resolution
                const photo = response.message.photo[response.message.photo.length - 1];
                state.parcelImage = photo.file_id;
                step = 6;
            } else if (response.message.text) {
                const text = response.message.text;
                const action = await handleCommonActions(text);
                if (action === "CANCEL") return;
                if (action === "BACK") { step = 4; continue; }

                if (text.includes("Ўтказиб юбориш")) {
                    state.parcelImage = null;
                    step = 6;
                } else {
                    await ctx.reply("Илтимос, расм юкланг ёки 'Ўтказиб юбориш'ни босинг.");
                }
            }
        }
        // Step 6: Confirm
        else if (step === 6) {
            let details = state.district;
            if (state.voiceId) details += " (🔊)";
            if (state.parcelImage) details += " (📸 Расм бор)";

            const summary = `
📦 <b>Почта Маълумотлари:</b>

📍 Йўналиш: ${state.from} ➡️ ${state.to}
⏰ Вақт: ${state.readableTime}
📦 Тур: ${state.packageType}
🚩 Тафсилотлар: ${details}
`;
            await ctx.reply(summary + "\n\n" + "Тасдиқлайсизми?", { parse_mode: "HTML", reply_markup: keyboardsUtils.confirmRideReply });

            const response = await conversation.waitFor("message:text");
            const text = response.message.text;
            const action = await handleCommonActions(text);

            if (action === "CANCEL") return;
            if (action === "BACK") { step = 5; continue; }

            if (text === "✅ Тасдиқлаш") {
                break;
            }
        }
    }

    // Save to DB
    let savedRequest;
    await conversation.external(async () => {
        const request = new RideRequest({
            passengerId: ctx.from.id,
            from: state.from,
            to: state.to,
            time: state.readableTime,
            seats: 0,
            type: 'parcel',
            packageType: state.packageType,
            district: state.district,
            voiceId: state.voiceId,
            parcelImage: state.parcelImage,
            status: 'searching'
        });
        savedRequest = await request.save();
    });

    await ctx.reply(`✅ Почта сўрови қабул қилинди!\n\nҲайдовчиларга юборилди. Таклифларни кутинг...`, { reply_markup: keyboardsUtils.passengerMenu });

    // Broadcast to drivers
    await conversation.external(async () => {
        const { broadcastRequest } = require("../utils/broadcastUtils");
        await broadcastRequest(ctx.api, savedRequest);
    });
}

module.exports = { parcelRequestConversation };
