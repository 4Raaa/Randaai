let messages = [];

// kirim pesan
function sendMessage(from, to, text) {
  const msg = {
    id: Date.now(),
    from,
    to,
    text,
    time: new Date().toISOString()
  };

  messages.push(msg);
  return msg;
}

// polling pesan
function pollMessage(user) {
  const userMessages = messages.filter(m => m.to === user);

  // hapus setelah diambil (biar kayak Telegram)
  messages = messages.filter(m => m.to !== user);

  return userMessages;
}

// handler vercel
export default function handler(req, res) {
  const { action, from, to, text, user } = req.query;

  // SEND MESSAGE
  if (action === "send") {
    if (!from || !to || !text) {
      return res.json({
        status: false,
        msg: "parameter kurang"
      });
    }

    const result = sendMessage(from, to, text);

    return res.json({
      status: true,
      result
    });
  }

  // POLLING MESSAGE
  if (action === "poll") {
    if (!user) {
      return res.json({
        status: false,
        msg: "user kosong"
      });
    }

    const result = pollMessage(user);

    return res.json({
      status: true,
      result
    });
  }

  // DEFAULT
  res.json({
    status: false,
    msg: "action tidak valid"
  });
}
