const { InlineKeyboard } = require('grammy');
const RideRequest = require('../models/RideRequest');
const User = require('../models/User');
const { t } = require('../utils/i18n');
const { getWithTTL, deleteEntry } = require('../utils/contextMap');

// Temporary conversation to handle Quick Request creation
async function quickRequestConversation(conversation, ctx) {
    // 1. Get Info from ContextMap with TTL support
    const mapData = await conversation.external(() => getWithTTL(ctx.from.id));
    const quickInfo = mapData ? mapData.quickOffer : null;
    if (!quickInfo || !quickInfo.driverId) {
        await ctx.reply("⚠️ Хатолик: Маълумотлар йўқолган.");
        return;
    }

    // Clean up the map entry immediately after reading
    await conversation.external(() => deleteEntry(ctx.from.id));

    const { driverId, from, to } = quickInfo;

    // 2. Ask Time (Skip Route Selection as it is inferred)
    await ctx.reply(`📍 <b>${from} ➡️ ${to}</b>\n\n⏰ Кетиш вақтини танланг:`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
            .text("🚀 Ҳозир", 'time_now').row()
            .text("📅 Бугун", 'time_today').row()
            .text("📆 Эртага", 'time_tomorrow')
    });

    const timeCtx = await conversation.waitFor('callback_query:data');
    const timeData = timeCtx.callbackQuery.data;
    await timeCtx.answerCallbackQuery();

    const timeMap = {
        'time_now': '🚀 Ҳозир',
        'time_today': '📅 Бугун',
        'time_tomorrow': '📆 Эртага'
    };
    const time = timeMap[timeData] || '🚀 Ҳозир';

    // 3. Create Request
    const request = await conversation.external(async () => {
        return await RideRequest.create({
            passengerId: ctx.from.id,
            from,
            to,
            time,
            seats: 1, // Default 1 for quick offer
            status: 'searching',
            type: 'taxi',
            createdAt: new Date()
        });
    });

    // 4. Notify Driver Directly
    const driver = await conversation.external(() => User.findById(driverId));
    const passenger = await conversation.external(() => User.findOne({ telegramId: ctx.from.id }));

    if (driver && passenger) {
        try {
            // Send Offer to Driver
            const offerMsg = `⚡️ <b>СИЗГА МАХСУС ТАКЛИФ ТУШДИ!</b>\n\n👤 Йўловчи: ${passenger.name}\n📍 Йўналиш: ${from} ➡️ ${to}\n⏰ Вақт: ${time}\n💺 Жой: 1 киши (Тахминий)\n\n<i>Ушбу йўловчи сизни тўғридан-тўғри танлади!</i>`;

            await conversation.external(async () => {
                await ctx.api.sendMessage(driver.telegramId, offerMsg, {
                    parse_mode: 'HTML',
                    reply_markup: new InlineKeyboard().text('🙋‍♂️ Таклиф бериш', `bid_${request._id}`)
                });
            });

            await timeCtx.reply('✅ <b>Таклиф юборилди!</b>\nҲайдовчи жавобини кутинг.\n\nБуюртмангиз яратилди.', { parse_mode: 'HTML' });
        } catch (e) {
            console.error("Failed to notify driver:", e);
            await timeCtx.reply('⚠️ Ҳайдовчига хабар юборишда хатолик бўлди.');
        }
    }
}

module.exports = { quickRequestConversation };
