const keyboards = require("../utils/keyboards");
const dynamicKeyboards = require("../utils/keyboardsDynamic");
const RideRequest = require("../models/RideRequest");
const User = require("../models/User");

const { getWithTTL, deleteEntry } = require("../utils/contextMap");

// Helper to get proper driver menu
async function getDriverMenuForUser(userId) {
    const user = await User.findOne({ telegramId: userId });
    if (!user) return null;
    const activeOrdersCount = await RideRequest.countDocuments({
        'offers.driverId': userId,
        'offers.status': 'accepted',
        status: 'matched'
    });
    const lang = user.language || 'uz_cyrillic';
    return dynamicKeyboards.getDriverMenu(lang, user.isOnline, user.activeRoute !== 'none', activeOrdersCount);
}

async function driverBidConversation(conversation, ctx) {
    // Extract requestId from in-memory Map (with TTL support)
    const requestId = await conversation.external(() => getWithTTL(ctx.from.id));

    console.log(`[DEBUG] Retrieved RequestId from Map: '${requestId}'`);

    if (!requestId) {
        return ctx.reply("⚠️ Хатолик: Буюртма топилмади (Сессия вақти тугаган бўлиши мумкин).");
    }

    // Clean up the map entry immediately after reading
    await conversation.external(() => deleteEntry(ctx.from.id));

    // Check request type to show correct keyboard
    let requestType = 'passenger';
    await conversation.external(async () => {
        const req = await RideRequest.findById(requestId);
        if (req) requestType = req.type;
    });

    const kb = requestType === 'parcel' ? keyboards.priceSuggestionParcel : keyboards.priceSuggestionTaxi;
    await ctx.reply("💰 Нархни танланг ёки ёзинг:", { reply_markup: kb });

    const { message } = await conversation.waitFor("message:text");
    const text = message.text;

    if (text === "❌ Бекор қилиш") {
        await ctx.reply("❌ Таклиф бекор қилинди.", { reply_markup: { remove_keyboard: true } });
        const driverKb = await getDriverMenuForUser(ctx.from.id);
        if (driverKb) await ctx.reply("Асосий меню", { reply_markup: driverKb });
        return;
    }

    let price;
    if (text === "✏️ Бошқа нарх") {
        await ctx.reply("💰 Нархни ёзинг (фақат рақамлар, масалан: 50000):", { reply_markup: { remove_keyboard: true } });
        const customRes = await conversation.waitFor("message:text");
        const customText = customRes.message.text;
        console.log(`[DEBUG] Raw custom input: '${customText}'`);

        // Strict Numeric Check (allowing spaces)
        if (!/^\d[\d\s]*$/.test(customText)) {
            const driverKb = await getDriverMenuForUser(ctx.from.id);
            await ctx.reply("⚠️ Илтимос, нархни фақат рақамларда ёзинг (сўз қўшмасдан). Масалан: 50000", { reply_markup: driverKb });
            return;
        }

        price = parseInt(customText.replace(/\D/g, ''));
    } else {
        // Predefined button values (guaranteed to be safe strings like "100 000")
        price = parseInt(text.replace(/\D/g, ''));
    }

    try {
        if (isNaN(price)) {
            return ctx.reply("⚠️ Илтимос, фақат рақам ёзинг. Қайтадан уриниб кўринг.");
        }

        console.log(`[DEBUG] Processing bid with price: ${price} for user ${ctx.from.id}`);

        // Save Offer directly to DB (with Checks)
        let result = {};
        await conversation.external(async () => {
            try {
                const driver = await User.findOne({ telegramId: ctx.from.id });
                const request = await RideRequest.findById(requestId);

                if (!request || request.status !== 'searching') {
                    console.log(`[DEBUG] Request not found or not searching: ${requestId}`);
                    return result = { status: 'not_found' };
                }

                // 1. Block Check
                const blockedEntry = (request.blockedDrivers || []).find(b => b.driverId === ctx.from.id);
                if (blockedEntry && blockedEntry.blockedUntil > new Date()) {
                    return result = { status: 'blocked', until: blockedEntry.blockedUntil };
                }

                // All checks passed, add offer
                request.offers.push({
                    driverId: ctx.from.id,
                    driverName: driver.name,
                    carModel: driver.carModel,
                    price: price
                });

                // Hide request from others
                request.status = 'negotiating';

                await request.save();
                console.log(`[DEBUG] Offer saved for request ${requestId}`);

                // Return full objects for notification
                result = { status: 'success', request: request, driver: driver };
            } catch (err) {
                console.error(`[ERROR] Error inside external block:`, err);
                result = { status: 'error', error: err.message };
            }
        });

        if (result.status === 'not_found') return ctx.reply("⚠️ Буюртма энди мавжуд эмас.");
        if (result.status === 'blocked') return ctx.reply(`⚠️ Сиз ушбу буюртмага вақтинча таклиф юбора олмайсиз (20 дақиқа).`);
        if (result.status === 'error') return ctx.reply(`⚠️ Хатолик юз берди: ${result.error}`);

        const updatedRequest = result.request;
        const driver = result.driver;

        const driverKb = await getDriverMenuForUser(ctx.from.id);
        await ctx.reply(`✅ Сизнинг таклифингиз (${price} сўм) йўловчига юборилди!`, { reply_markup: driverKb });

        // Notify Passenger
        const newOffer = updatedRequest.offers[updatedRequest.offers.length - 1];

        // Format Car Model
        const modelKey = driver.carDetails ? driver.carDetails.model : driver.carModel;
        const niceModel = keyboards.carNameMap[modelKey] || modelKey;

        // Build clean offer message for passenger (no technical details)
        const offerMessage = `
🚕 <b>ЯНГИ ТАКЛИФ!</b>

<b>📍 Йўналиш:</b> ${updatedRequest.from} ➡️ ${updatedRequest.to}
<b>⏰ Вақт:</b> ${updatedRequest.time}
${updatedRequest.type === 'parcel' ? `<b>📦 Тур:</b> ${updatedRequest.packageType}` : `<b>💺 Йўловчилар:</b> ${updatedRequest.seats} нафар`}

<b>👤 Ҳайдовчи:</b> ${driver.name}
<b>🚗 Машина:</b> ${niceModel}
<b>🎨 Ранг:</b> ${driver.carDetails ? driver.carDetails.color : "-"}

<b>💰 Таклиф нархи:</b> ${price} сўм
`;

        // Send to passenger
        try {
            await ctx.api.sendMessage(updatedRequest.passengerId, offerMessage, {
                parse_mode: "HTML",
                reply_markup: keyboards.offerAction(updatedRequest._id, newOffer._id, driver._id)
            });
            console.log(`[DEBUG] Offer sent to passenger ${updatedRequest.passengerId}`);
        } catch (e) {
            console.error("[ERROR] Failed to send offer to passenger:", e);
        }

    } catch (error) {
        console.error(`[CRITICAL] Error in driverBidConversation:`, error);
        await ctx.reply("⚠️ Тизим хатолиги юз берди. Илтимос қайтадан уриниб кўринг.");
    }
}

module.exports = { driverBidConversation };
