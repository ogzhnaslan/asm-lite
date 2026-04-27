function daysUntil(isoString) {
    if (!isoString) return null;
    return Math.floor((new Date(isoString).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function now() {
    return new Date();
}

module.exports = { daysUntil, now };
