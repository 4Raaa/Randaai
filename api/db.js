let messages = [];
const users = new Map(); // user registry
const MAX_MESSAGE_AGE = 1000 * 60 * 60 * 24; // 24 jam auto-cleanup
const RATE_LIMIT_WINDOW = 1000 * 60; // 1 menit
const MAX_MESSAGES_PER_WINDOW = 30;

// Rate limiter sederhana
const rateLimits = new Map();

function checkRateLimit(user) {
  const now = Date.now();
  const userLimit = rateLimits.get(user) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  
  if (now > userLimit.resetTime) {
    userLimit.count = 1;
    userLimit.resetTime = now + RATE_LIMIT_WINDOW;
  } else {
    userLimit.count++;
  }
  
  rateLimits.set(user, userLimit);
  return userLimit.count <= MAX_MESSAGES_PER_WINDOW;
}

// Kirim pesan dengan encryption simulasi & metadata lengkap
function sendMessage(from, to, text, options = {}) {
  // Validasi
  if (!from || !to || !text || text.length > 5000) {
    return { error: "Invalid payload", code: 400 };
  }

  // Rate limit check
  if (!checkRateLimit(from)) {
    return { error: "Rate limit exceeded", code: 429 };
  }

  const msg = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    from,
    to,
    text: Buffer.from(text).toString('base64'), // simulasi encryption
    timestamp: Date.now(),
    isoTime: new Date().toISOString(),
    type: options.type || 'text',
    metadata: {
      ip: options.ip || 'unknown',
      userAgent: options.ua || 'unknown',
      edited: false,
      read: false
    }
  };

  messages.push(msg);
  
  // Trigger webhook jika ada (async)
  if (users.has(to) && users.get(to).webhook) {
    notifyWebhook(to, msg).catch(console.error);
  }

  return { 
    success: true, 
    messageId: msg.id,
    delivered: true,
    timestamp: msg.isoTime
  };
}

// Polling dengan cursor-based pagination & filtering
function pollMessage(user, options = {}) {
  const { cursor, limit = 50, type, since } = options;
  
  let userMessages = messages.filter(m => {
    if (m.to !== user) return false;
    if (type && m.type !== type) return false;
    if (since && m.timestamp < since) return false;
    if (cursor && m.id <= cursor) return false;
    return true;
  });

  // Sort by timestamp
  userMessages.sort((a, b) => a.timestamp - b.timestamp);
  
  // Pagination
  const paginated = userMessages.slice(0, limit);
  
  // Mark as read & hapus dari queue utama (atomic)
  const idsToRemove = new Set(paginated.map(m => m.id));
  messages = messages.filter(m => !idsToRemove.has(m.id));
  
  // Decode text sebelum kirim ke client
  const decoded = paginated.map(m => ({
    ...m,
    text: Buffer.from(m.text, 'base64').toString('utf8')
  }));

  return {
    messages: decoded,
    nextCursor: paginated.length > 0 ? paginated[paginated.length - 1].id : null,
    remaining: userMessages.length - paginated.length,
    count: decoded.length
  };
}

// Auto-cleanup pesan lama (background)
setInterval(() => {
  const cutoff = Date.now() - MAX_MESSAGE_AGE;
  const before = messages.length;
  messages = messages.filter(m => m.timestamp > cutoff);
  if (messages.length !== before) {
    console.log(`🧹 Cleaned ${before - messages.length} old messages`);
  }
}, 1000 * 60 * 10); // tiap 10 menit

// Webhook notifier
async function notifyWebhook(userId, message) {
  const user = users.get(userId);
  if (!user?.webhook) return;
  
  try {
    await fetch(user.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'new_message',
        userId,
        messageId: message.id,
        from: message.from,
        timestamp: message.isoTime
      })
    });
  } catch (err) {
    console.error(`Webhook failed for ${userId}:`, err.message);
  }
}

// Handler dengan proper HTTP status codes & CORS
export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, from, to, text, user, cursor, limit, type, since } = req.query;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  // Health check endpoint
  if (action === 'health') {
    return res.status(200).json({
      status: 'healthy',
      uptime: process.uptime(),
      messagesInQueue: messages.length,
      activeUsers: users.size,
      version: '2.0.0'
    });
  }

  // Register user dengan webhook support
  if (action === 'register') {
    const { webhook } = req.query;
    if (!user) return res.status(400).json({ error: 'User required' });
    
    users.set(user, { 
      registeredAt: Date.now(), 
      webhook: webhook || null 
    });
    
    return res.status(201).json({ 
      success: true, 
      user,
      webhookConfigured: !!webhook 
    });
  }

  // SEND MESSAGE
  if (action === 'send') {
    const result = sendMessage(from, to, text, { ip: clientIp, ua: userAgent });
    
    if (result.error) {
      return res.status(result.code).json({ 
        success: false, 
        error: result.error 
      });
    }

    return res.status(200).json(result);
  }

  // POLLING MESSAGE
  if (action === 'poll') {
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: 'User parameter required' 
      });
    }

    const result = pollMessage(user, { cursor, limit: parseInt(limit) || 50, type, since });
    
    return res.status(200).json({
      success: true,
      ...result,
      serverTime: new Date().toISOString()
    });
  }

  // Get message history (untuk user yang mau lihat sent messages)
  if (action === 'history') {
    if (!user) return res.status(400).json({ error: 'User required' });
    
    const sent = messages
      .filter(m => m.from === user)
      .map(m => ({
        ...m,
        text: Buffer.from(m.text, 'base64').toString('utf8')
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
      
    return res.status(200).json({ sent, count: sent.length });
  }

  // DEFAULT
  res.status(400).json({ 
    success: false, 
    error: 'Invalid action',
    validActions: ['send', 'poll', 'register', 'health', 'history']
  });
}
  
