import http from "node:http";
import { application } from "../functions/routes.mjs";
import { createMemoryDb } from "./memory-db.mjs";
import { templateVerdict } from "../functions/templates.mjs";
import { createVerdictProvider } from "../functions/verdict-ai.mjs";

class BackendError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const db = createMemoryDb();
const fallback = (c) => ({ text: templateVerdict(c.scenario, c.options[c.resultIndex]), source: "template" });
const handle = application({
  db,
  BackendError,
  verdictProvider: createVerdictProvider({ db, origin: "https://api.qoder.com", fallback }),
});

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const request = new Request(`http://127.0.0.1:8000${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
  });
  const response = await handle({ request, requestId: crypto.randomUUID() });
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(await response.text());
});

server.listen(8000, "127.0.0.1", () => console.log("local function on http://127.0.0.1:8000"));