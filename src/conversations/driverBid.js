const keyboards = require("../utils/keyboards");
const RideRequest = require("../models/RideRequest");
const User = require("../models/User");

const { contextMap } = require("../utils/contextMap");

async function driverBidConversation(conversation, ctx) {
    // Extract requestId from in-memory Map
    const requestId = await conversation.external(() => contextMap.get(ctx.from.id));

    console.log(`[DEBUG] Retrieved RequestId from Map: '${requestId}'`);

    if (!requestId) {
        return ctx.reply("⚠️ Xatolik: Buyurtma topilmadi (Sessiya vaqti tugagan bo'lishi mumkin).");
    }

    // Check request type to show correct keyboard
    let requestType = 'passenger';
    await conversation.external(async () => {
        const req = await RideRequest.findById(requestId);
        if (req) requestType = req.type;
    });

    const kb = requestType === 'parcel' ? keyboards.priceSuggestionParcel : keyboards.priceSuggestionTaxi;
    await ctx.reply("💰 Narxni tanlang yoki yozing:", { reply_markup: kb });

    const { message } = await conversation.waitFor("message:text");
    const text = message.text;

    if (text === "❌ Bekor qilish") {
        await ctx.reply("❌ Taklif bekor qilindi.", { reply_markup: { remove_keyboard: true } }); // Or restore driver menu? Driver menu is safer.
        await ctx.reply("Asosiy menyu", { reply_markup: keyboards.driverMenu });
        return;
    }

    let price;
    if (text === "✏️ Boshqa narx") {
        await ctx.reply("💰 Narxni yozing (so'mda, masalan: 50000):", { reply_markup: { remove_keyboard: true } });
        const customRes = await conversation.waitFor("message:text");
        price = parseInt(customRes.message.text.replace(/\D/g, ''));
    } else {
        price = parseInt(text.replace(/\D/g, ''));
    }

    if (isNaN(price)) {
        return ctx.reply("⚠️ Iltimos, faqat raqam yozing. Qaytadan urinib ko'ring.");
    }

    // Save Offer directly to DB (with Checks)
    let result;
    await conversation.external(async () => {
        const driver = await User.findOne({ telegramId: ctx.from.id });
        const request = await RideRequest.findById(requestId);

        if (!request || request.status !== 'searching') {
            return result = { status: 'not_found' };
        }

        // 1. Block Check
        const blockedEntry = (request.blockedDrivers || []).find(b => b.driverId === ctx.from.id);
        if (blockedEntry && blockedEntry.blockedUntil > new Date()) {
            return result = { status: 'blocked', until: blockedEntry.blockedUntil };
        }

        // 2. Capacity Check - DISABLED per user request (Drivers manage their own capacity)
        /*
        const driverCapacity = (driver.carDetails && driver.carDetails.seats) ? driver.carDetails.seats : 4;
        const activeLoadRequests = await RideRequest.find({
            status: 'matched',
            "offers": { $elemMatch: { driverId: ctx.from.id, status: 'accepted' } }
        });
        const currentPassengers = activeLoadRequests.reduce((sum, req) => sum + req.seats, 0);

        if (currentPassengers + request.seats > driverCapacity) {
             return result = {
                status: 'capacity_full',
                current: currentPassengers,
                needed: request.seats,
                max: driverCapacity
            };
        }
        */

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

        // Return full objects for notification
        result = { status: 'success', request: request, driver: driver };
    });

    if (result.status === 'not_found') return ctx.reply("⚠️ Buyurtma endi mavjud emas.");
    if (result.status === 'blocked') return ctx.reply(`⚠️ Siz ushbu buyurtmaga vaqtincha taklif yubora olmaysiz (20 daqiqa).`);
    if (result.status === 'capacity_full') return ctx.reply(`⚠️ <b>O'rin yetarli emas!</b>\n\nSizda bo'sh joy: ${result.max - result.current}\nKerakli joy: ${result.needed}`, { parse_mode: "HTML" });

    const updatedRequest = result.request;
    const driver = result.driver;

    await ctx.reply(`✅ Sizning taklifingiz(${price} so'm) yo'lovchiga yuborildi!`, { reply_markup: keyboards.driverMenu });

    // Notify Passenger
    const offerIndex = updatedRequest.offers.length - 1;

    // Format Car Model
    const modelKey = driver.carDetails ? driver.carDetails.model : driver.carModel;
    const niceModel = keyboards.carNameMap[modelKey] || modelKey;

    const offerMessage = `
🚕 Yangi taklif!

👤 Haydovchi: ${driver.name}
🚗 Mashina: ${niceModel}
🎨 Rang: ${driver.carDetails ? driver.carDetails.color : "-"}
💰 Narx: ${price} so'm
    `;

    // Send to passenger
    try {
        await ctx.api.sendMessage(updatedRequest.passengerId, offerMessage, {
            reply_markup: keyboards.offerAction(offerIndex, driver._id)
        });
    } catch (e) {
        console.error("Failed to send offer to passenger:", e);
    }
}

module.exports = { driverBidConversation };
