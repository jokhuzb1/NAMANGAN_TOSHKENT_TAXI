const dictionary = {
    uz_latin: {
        welcome: 'Assalomu alaykum!',
        role_select_title: 'Iltimos, rolingizni tanlang:',
        driver: '🚖 Haydovchi',
        passenger: '🧍 Yo''lovchi',
        order_taxi: '🚕 Taksi buyurtma qilish',
        my_orders: '🚖 Mening Buyurtmam',
        send_parcel: '📦 Pochta yuborish',
        settings: '⚙️ Sozlamalar',
        cancel: '❌ Bekor qilish',
        back: '⬅️ Orqaga',
        confirm: '✅ Tasdiqlash',
        completed: '✅ Yakunlash',
        searching: '🔍 Qidirilmoqda',
        matched: '✅ Haydovchi topildi',
        time_now: '🚀 Hozir (Tezkor)',
        time_today: '☀️ Bugun',
        time_tomorrow: '🌙 Ertaga',
        seat_front: 'Old o''rindiq',
        seat_back: 'Orqa o''rindiq',
        seat_any: 'Farqi yo''q',
        verified: '✅ Tasdiqlangan',
        call: '📞 Bog''lanish',
        available_drivers: '👀 Bo''sh haydovchilar',
        finish_route: '🏁 Yakunlash',
        rest_mode: '🔴 Dam olyapman',
        work_mode: '🟢 Ishdaman',
        active_orders: '📡 OCHIQ BUYURTMALAR'
    },
    uz_cyrillic: {
        welcome: 'Ассалому алайкум!',
        role_select_title: 'Илтимос, ролингизни танланг:',
        driver: '🚖 Ҳайдовчи',
        passenger: '🧍 Йўловчи',
        order_taxi: '🚕 Такси буюртма қилиш',
        my_orders: '🚖 Менинг Буюртмам',
        send_parcel: '📦 Почта юбориш',
        settings: '⚙️ Созламалар',
        cancel: '❌ Бекор қилиш',
        back: '⬅️ Орқага',
        confirm: '✅ Тасдиқлаш',
        completed: '✅ Якунлаш',
        searching: '🔍 Қидирилмоқда',
        matched: '✅ Ҳайдовчи топилди',
        time_now: '🚀 Ҳозир (Тезкор)',
        time_today: '☀️ Бугун',
        time_tomorrow: '🌙 Эртага',
        seat_front: 'Олд ўриндиқ',
        seat_back: 'Орқа ўриндиқ',
        seat_any: 'Фарқи йўқ',
        verified: '✅ Тасдиқланган',
        call: '📞 Боғланиш',
        available_drivers: '👀 Бўш ҳайдовчилар',
        finish_route: '🏁 Якунлаш',
        rest_mode: '🔴 Дам оляпман',
        work_mode: '🟢 Ишдаман',
        active_orders: '📡 ОЧИҚ БУЮРТМАЛАР'
    }
};

function t(key, lang = 'uz_cyrillic') {
    return dictionary[lang]?.[key] || dictionary['uz_cyrillic'][key] || key;
}

function formatTime(date) {
    return new Date(date).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', hour12: false });
}

module.exports = { t, formatTime, dictionary };
