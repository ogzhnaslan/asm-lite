function parseHost(value) {
    return value.split(":")[0];
}

module.exports = { parseHost };
