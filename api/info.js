export default function handler(req, res) {
  res.json({
    name: "RanAi",
    desc: "AI sederhana berbasis wrapper gemini-lite",
    creator: "Randa",
    endpoint: "/api/ranai?q=",
    mode: ["smart", "fun", "dark"]
  });
}
