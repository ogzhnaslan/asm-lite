const http = require("node:http");

const PORT = 5555;

http
    .createServer((req, res) => {
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("lab server: 500 internal error\n");
    })
    .listen(PORT, "127.0.0.1", () => {
        console.log(`[lab] 500 server running on http://127.0.0.1:${PORT}`);
    });