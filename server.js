// Minimal WhatsApp Cloud API webhook (no dependencies).
// Env vars:
//   VERIFY_TOKEN     - any secret string; you type the same value into the Meta dashboard
//   WHATSAPP_TOKEN   - access token from Meta (optional; needed only to send replies)
//   PHONE_NUMBER_ID  - your WhatsApp phone number ID (optional; needed only to send replies)
//   GRAPH_VERSION    - Graph API version, default v23.0
//   PORT             - default 3000

const http = require("http");

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my-verify-token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v23.0";

async function sendText(to, body) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return;
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    }
  );
  if (!res.ok) console.error("Send failed:", res.status, await res.text());
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname !== "/webhook") {
    res.writeHead(200).end("WhatsApp webhook is running. Use /webhook");
    return;
  }

  // Meta verification handshake
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      res.writeHead(200, { "Content-Type": "text/plain" }).end(challenge);
    } else {
      res.writeHead(403).end("Forbidden");
    }
    return;
  }

  // Incoming messages / status updates
  if (req.method === "POST") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", async () => {
      res.writeHead(200).end("EVENT_RECEIVED"); // reply fast so Meta doesn't retry
      try {
        const data = JSON.parse(raw);
        for (const entry of data.entry || []) {
          for (const change of entry.changes || []) {
            for (const msg of change.value?.messages || []) {
              const text = msg.text?.body;
              console.log(`Message from ${msg.from}:`, text ?? `[${msg.type}]`);
              // Chatbot logic goes here. For now: echo the text back.
              if (text) await sendText(msg.from, `You said: ${text}`);
            }
          }
        }
      } catch (err) {
        console.error("Bad payload:", err.message);
      }
    });
    return;
  }

  res.writeHead(405).end();
});

server.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}/webhook`));
