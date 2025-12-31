const RideRequest = require("../models/RideRequest");
const User = require("../models/User");
const keyboardsUtils = require("../utils/keyboards");
const { Keyboard } = require("grammy");

async function parcelRequestConversation(conversation, ctx) {
    let step = 1;
    const state = {};

    while (step <= 5) {
        // Common Handler for Cancel
        const handleCommonActions = async (text) => {
            if (text === "❌ Bekor qilish") {
                await ctx.reply("❌ Pochta yuborish bekor qilindi.", { reply_markup: keyboardsUtils.passengerMenu });
                return "CANCEL";
            }
            if (text === "⬅️ Orqaga") {
                return "BACK";
            }
            return null;
        };

        // Step 1: Route
        if (step === 1) {
            await ctx.reply("📦 Pochta yuborish uchun yo'nalishni tanlang:", { reply_markup: keyboardsUtils.routeSelectionReply });
            const response = await conversation.waitFor("message:text");
            const text = response.message.text;

            const action = await handleCommonActions(text);
            if (action === "CANCEL") return;

            if (text.includes("Tashkent ➡️ Namangan")) {
                state.from = "Tashkent";
                state.to = "Namangan";
                state.routeData = "route_tash_nam";
            } else if (text.includes("Namangan ➡️ Tashkent")) {
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
            await ctx.reply("⏰ Qachon yuborasiz?", { reply_markup: keyboardsUtils.parcelTimeSelectionReply });
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
            await ctx.reply("📦 Nima yubormoqchisiz?", { reply_markup: keyboardsUtils.packageTypeSelectionReply });
            const response = await conversation.waitFor("message:text");
            const text = response.message.text;

            const action = await handleCommonActions(text);
            if (action === "CANCEL") return;
            if (action === "BACK") { step = 2; continue; }

            state.packageTypeRaw = text;
            state.packageType = text.replace(/[\u{1F600}-\u{1F6FF}|[\u{2600}-\u{26FF}]/gu, "").trim();

            if (text.includes("Dokument")) state.packageType = "Dokument";
            else if (text.includes("Korobka")) state.packageType = "Korobka";
            else if (text.includes("Yuk")) state.packageType = "Yuk";
            else state.packageType = "Boshqa";

            step = 4;
        }
        // Step 4: Location Details (Text or Voice)
        else if (step === 4) {
            const kb = new Keyboard()
                .text("⬅️ Orqaga").text("❌ Bekor qilish")
                .resized();

            await ctx.reply(`🚩 <b>Pochta haqida qo'shimcha ma'lumot:</b>\n\nMasalan: <i>"Qayerdan olib ketish va kimga berish, yuk og'irligi..."</i>\n\nYozishingiz yoki <b>Ovozli xabar</b> yuborishingiz mumkin.`, {
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
                state.district = "🔊 Ovozli xabar";
                state.voiceId = response.message.voice.file_id;
                step = 5;
            }
        }
        // Step 5: Confirm
        else if (step === 5) {
            let details = state.district;
            if (state.voiceId) details += " (🔊)";

            const summary = `
📦 <b>Pochta Ma'lumotlari:</b>

📍 Yo'nalish: ${state.from} ➡️ ${state.to}
⏰ Vaqt: ${state.readableTime}
📦 Tur: ${state.packageType}
🚩 Tafsilotlar: ${details}
`;
            await ctx.reply(summary + "\n\n" + "Tasdiqlaysizmi?", { parse_mode: "HTML", reply_markup: keyboardsUtils.confirmRideReply });

            const response = await conversation.waitFor("message:text");
            const text = response.message.text;
            const action = await handleCommonActions(text);

            if (action === "CANCEL") return;
            if (action === "BACK") { step = 4; continue; }

            if (text === "✅ Tasdiqlash") {
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
            status: 'searching'
        });
        savedRequest = await request.save();
    });

    await ctx.reply(`✅ Pochta so'rovi qabul qilindi! ID: ${savedRequest._id}\n\nHaydovchilarga yuborildi. Takliflarni kuting...`, { reply_markup: keyboardsUtils.passengerMenu });

    // Broadcast to drivers
    await conversation.external(async () => {
        const { broadcastRequest } = require("../utils/broadcastUtils");
        await broadcastRequest(ctx.api, savedRequest);
    });
}

module.exports = { parcelRequestConversation };
