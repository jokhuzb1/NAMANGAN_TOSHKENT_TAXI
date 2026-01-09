const dictionary = {
    uz_latin: {
        welcome: 'Assalomu alaykum!',
        role_select_title: 'Iltimos, rolingizni tanlang:',
        driver: '🚖 Haydovchi',
        passenger: '🧍 Yo\'lovchi',
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
        seat_front: 'Old o\'rindiq',
        seat_back: 'Orqa o\'rindiq',
        seat_any: 'Farqi yo\'q',
        verified: '✅ Tasdiqlangan',
        call: '📞 Bog\'lanish',
        available_drivers: '👀 Bo\'sh haydovchilar',
        finish_route: '🏁 Yakunlash',
        rest_mode: '🔴 Dam olyapman',
        work_mode: '🟢 Ishdaman',
        active_orders: '📡 OCHIQ BUYURTMALAR',
        my_passengers: '👤 Mening Yo\'lovchilarim',
        complete_all: '✅ Hammasini yakunlash'
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
        active_orders: '📡 ОЧИҚ БУЮРТМАЛАР',
        my_passengers: '👤 Менинг Йўловчиларим',
        complete_all: '✅ Ҳаммасини якунлаш'
    }
};

function t(key, lang) {
    const useLang = (lang && dictionary[lang]) ? lang : 'uz_cyrillic';
    return dictionary[useLang]?.[key] || dictionary['uz_cyrillic'][key] || key;
}

// Uzbek Cyrillic month names
const monthsCyrillic = ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

// Uzbek Cyrillic weekday names
const weekdaysCyrillic = ['Якшанба', 'Душанба', 'Сешанба', 'Чоршанба', 'Пайшанба', 'Жума', 'Шанба'];

/**
 * Format date with day, month, weekday and time
 * Example: "9 январ Душанба 14:30"
 */
function formatDateTime(date) {
    const d = new Date(date);
    // Convert to Tashkent timezone
    const options = { timeZone: 'Asia/Tashkent' };
    const tashkentDate = new Date(d.toLocaleString('en-US', options));

    const day = tashkentDate.getDate();
    const month = monthsCyrillic[tashkentDate.getMonth()];
    const weekday = weekdaysCyrillic[tashkentDate.getDay()];
    const hours = String(tashkentDate.getHours()).padStart(2, '0');
    const minutes = String(tashkentDate.getMinutes()).padStart(2, '0');

    return `${day} ${month} ${weekday} ${hours}:${minutes}`;
}

/**
 * Format time only (HH:MM)
 */
function formatTimeOnly(date) {
    return new Date(date).toLocaleTimeString('uz-UZ', {
        timeZone: 'Asia/Tashkent',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Legacy formatTime - now returns full date+time
 */
function formatTime(date) {
    return formatDateTime(date);
}

module.exports = { t, formatTime, formatDateTime, formatTimeOnly, dictionary, monthsCyrillic, weekdaysCyrillic };
