import { POST } from "./src/app/api/orders/email-ingest/route";

async function run() {
  const req = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({
      plain: "Quiero 5 manzanas",
      headers: { from: "test@example.com", subject: "Pedido" }
    })
  });
  
  try {
    const res = await POST(req);
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  } catch(e) {
    console.error("Uncaught Error:", e);
  }
}

run();
