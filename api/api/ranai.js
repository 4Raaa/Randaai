export default async function handler(req, res) {
  const { q, mode } = req.query;

  if (!q) {
    return res.json({
      status: false,
      message: "Masukkan query 😹"
    });
  }

  // 🎭 Mode personality
  const styles = {
    smart: "🧠 Mode pintar aktif...",
    fun: "😹 Mode santai aktif...",
    dark: "😈 Mode gelap aktif..."
  };

  const mood = styles[mode] || "🤖 RanAi siap membantu...";

  try {
    const response = await fetch(
      "https://api.danzy.web.id/api/ai/gemini-lite?q=" + encodeURIComponent(q)
    );

    const data = await response.json();

    const hasil = data.result?.parts?.[0]?.text || "Tidak ada respon";

    res.json({
      ai: {
        name: "RanAi 🤖",
        version: "1.0",
        creator: "Randa",
        status: "online"
      },
      mood: mood,
      result: hasil,
      meta: {
        query: q,
        mode: mode || "default",
        time: new Date().toLocaleString()
      }
    });

  } catch (err) {
    res.status(500).json({
      status: false,
      message: "RanAi error 😹"
    });
  }
}
