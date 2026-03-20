require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const { createApp } = require("./app");
const { connectDB } = require("./config/db");
const { initSocket } = require("./realtime/socket");

const listEndpoints = require("express-list-endpoints");

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: true, credentials: true },
  });
  initSocket(io);

  const port = process.env.PORT || 4000;

  server.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`🧪 Test UI: http://localhost:${port}/`);
  });

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.warn("⚠️ Missing MONGO_URI in .env (server still running)");
    return;
  }

  try {
    await connectDB(mongoUri);

      console.log("=== API ROUTES ===");
      console.table(listEndpoints(app));

  } catch (err) {
    console.warn(
      "⚠️ MongoDB connect failed (server still running):",
      err.message,
    );
  }
}

main();
