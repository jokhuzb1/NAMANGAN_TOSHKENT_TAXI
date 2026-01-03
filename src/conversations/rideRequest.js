const RideRequest = require("../models/RideRequest");
const User = require("../models/User");
const keyboardsUtils = require("../utils/keyboards");
const { Keyboard } = require("grammy");

async function rideRequestConversation(conversation, ctx) {
    let step = 1;
    const state = {};

    while (step <= 6) {
        // Common Handler for Cancel
        const handleCommonActions = async (text) => {
            if (text === "❌ Бекор қилиш") {
                await ctx.reply("❌ Буюртма бекор қилинди.", { reply_markup: keyboardsUtils.passengerMenu });
                return "CANCEL";
            }
            if (text === "⬅️ Орқага") {
                return "BACK";
            }
            return null;
        };

        // Step 1: Route
        if (step === 1) {
            await ctx.reply("📍 Қайси йўналишда кетмоқчисиз?", { reply_markup: keyboardsUtils.routeSelectionReply });
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
            await ctx.reply("⏰ Қачон йўлга чиқасиз?", { reply_markup: keyboardsUtils.timeSelectionReply });
            const response = await conversation.waitFor("message:text");
            const text = response.message.text;

            const action = await handleCommonActions(text);
            if (action === "CANCEL") return;
            if (action === "BACK") { step = 1; continue; }

            state.readableTime = text; // Save Cyrillic text directly (e.g. "Ҳозир", "Бугун")
            state.timeData = text;
            step = 3;
        }
        // Step 3: Seats
        else if (step === 3) {
            await ctx.reply("💺 Нечта жой керак?", { reply_markup: keyboardsUtils.seatSelectionReply });
            const response = await conversation.waitFor("message:text");
            const text = response.message.text;

            const action = await handleCommonActions(text);
            if (action === "CANCEL") return;
            if (action === "BACK") { step = 2; continue; }

            const val = parseInt(text);
            if (!isNaN(val)) {
                state.seatCount = val;
                step = 4;
            }
        }
        // Step 4: Seat Type
        else if (step === 4) {
            await ctx.reply("💺 Қаерда ўтирмоқчисиз?", { reply_markup: keyboardsUtils.seatTypeSelectionReply });
            const response = await conversation.waitFor("message:text");
            const text = response.message.text;

            const action = await handleCommonActions(text);
            if (action === "CANCEL") return;
            if (action === "BACK") { step = 3; continue; }

            state.seatTypeRaw = text; // "Олд ўриндиқ", etc.

            // Map to internal enum key
            if (text.includes("Олд")) state.seatTypeKey = "seat_front";
            else if (text.includes("Орқа")) state.seatTypeKey = "seat_back";
            else state.seatTypeKey = "seat_any";

            step = 5;
        }
        // Step 5: Location Details (Text or Voice)
        else if (step === 5) {
            const kb = new Keyboard()
                .text("⬅️ Орқага").text("❌ Бекор қилиш")
                .resized();

            await ctx.reply(`🚩 <b>Аниқ манзилни киритинг:</b>\n\nМасалан: <i>"Юнусобод, Мега Планет олди"</i> ёки <b>Овозли хабар</b> юборинг.`, {
                parse_mode: "HTML",
                reply_markup: kb
            });

            const response = await conversation.waitFor(["message:text", "message:voice"]);

            if (response.message.text) {
                const text = response.message.text;
                const action = await handleCommonActions(text);
                if (action === "CANCEL") return;
                if (action === "BACK") { step = 4; continue; }

                state.district = text;
                state.voiceId = null;
                step = 6;

            } else if (response.message.voice) {
                state.district = "🔊 Овозли хабар";
                state.voiceId = response.message.voice.file_id;
                step = 6;
            }
        }
        // Step 6: Confirm
        else if (step === 6) {
            let details = state.district;
            if (state.voiceId) details += " (🔊)";

            const summary = `
📋 Буюртма маълумотлари:

📍 Йўналиш: ${state.from} ➡️ ${state.to}
⏰ Вақт: ${state.readableTime}
💺 Жойлар: ${state.seatCount} та (${state.seatTypeRaw})
🚩 Манзил: ${details}
`;
            await ctx.reply(summary + "\n\n" + "Тасдиқлайсизми?", { reply_markup: keyboardsUtils.confirmRideReply });

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
            seats: state.seatCount,
            seatType: state.seatTypeKey.replace("seat_", ""),
            district: state.district,
            voiceId: state.voiceId,
            status: 'searching'
        });
        savedRequest = await request.save();
    });

    await ctx.reply(`✅ Буюртмангиз қабул қилинди!\n\nҲайдовчиларга юборилди. Таклифларни кутинг...`, { reply_markup: keyboardsUtils.passengerMenu });

    // Broadcast to drivers
    await conversation.external(async () => {
        const { broadcastRequest } = require("../utils/broadcastUtils");
        await broadcastRequest(ctx.api, savedRequest);
    });
}

module.exports = { rideRequestConversation };
