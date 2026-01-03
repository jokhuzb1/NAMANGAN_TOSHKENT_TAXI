const { t } = require('./i18n_fixed');
const { Keyboard } = require('grammy');

function getRoleSelection(lang) {
    return new Keyboard()
        .text(t('driver', lang)).text(t('passenger', lang))
        .resized();
}

function getPassengerMenu(lang) {
    return new Keyboard()
        .text(t('order_taxi', lang))
        .row()
        .text(t('my_orders', lang))
        .row()
        .text(t('send_parcel', lang))
        .row()
        .text(t('available_drivers', lang))
        .text(t('settings', lang))
        .resized();
}

function getDriverMenu(lang, isOnline = false, hasActiveRide = false) {
    const kb = new Keyboard();

    // Top row: Work status toggle
    if (hasActiveRide) {
        kb.text(t('finish_route', lang));
    } else {
        if (isOnline) {
            kb.text(t('rest_mode', lang));
        } else {
            kb.text(t('work_mode', lang));
        }
    }

    // Second row: Radar and My Passengers (always visible)
    kb.row()
        .text(t('active_orders', lang))
        .text(t('my_passengers', lang));

    // Third row: Complete All (always visible for convenience)
    kb.row()
        .text(t('complete_all', lang));

    // Fourth row: Settings
    kb.row()
        .text(t('settings', lang));

    kb.resized();
    return kb;
}

module.exports = { getRoleSelection, getPassengerMenu, getDriverMenu };
