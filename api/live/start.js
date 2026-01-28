// In-memory storage (use Redis in production)
let activeUsers = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'POST') {
    const { lat, lng, name, color } = req.body;
    const userId = Date.now().toString(); // Simple ID
    
    activeUsers[userId] = {
      lat: lat || 6.8670,
      lng: lng || 7.3980,
      name: name || 'Anonymous',
      color: color || '#FF0000',
      last_update: Date.now()
    };
    
    // Clean up old users (older than 5 minutes)
    const now = Date.now();
    Object.keys(activeUsers).forEach(userId => {
      if (now - activeUsers[userId].last_update > 300000) {
        delete activeUsers[userId];
      }
    });
    
    res.status(200).json({
      success: true,
      user_id: userId,
      message: "Live tracking started"
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}