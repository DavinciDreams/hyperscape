import fs from "fs";
import https from "https";
import httpProxy from "http-proxy";

const key = fs.readFileSync(".cert/hyperscape-local.key");
const cert = fs.readFileSync(".cert/hyperscape-local.crt");

function startProxy({ name, port, target }) {
  const proxy = httpProxy.createProxyServer({
    target,
    ws: true,
    changeOrigin: true,
    secure: false,
  });

  proxy.on("error", (err, _req, res) => {
    console.error(`[${name}] proxy error:`, err.message);
    if (res?.writeHead) {
      res.writeHead(502);
      res.end("Proxy error");
    }
  });

  const server = https.createServer({ key, cert }, (req, res) => {
    proxy.web(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    proxy.ws(req, socket, head);
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[${name}] https://0.0.0.0:${port} -> ${target}`);
  });
}

startProxy({ name: "api", port: 5558, target: "http://127.0.0.1:5555" });
startProxy({ name: "ws", port: 5557, target: "ws://127.0.0.1:5556" });
startProxy({ name: "cdn", port: 5559, target: "http://127.0.0.1:8080" });
