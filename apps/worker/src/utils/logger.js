function log(tag, data) {
    if (data !== undefined) {
        console.log(`[worker] ${tag}`, data);
    } else {
        console.log(`[worker] ${tag}`);
    }
}

module.exports = { log };
