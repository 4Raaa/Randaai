export default function handler(req, res) {
  res.json({
    status: "online",
    ai: "RanAi 🤖",
    uptime: process.uptime(),
    version: "1.0"
  });
}
