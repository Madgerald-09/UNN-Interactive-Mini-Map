// Serverless function for locations
const UNN_BUILDINGS = [
  {
    "id": 1,
    "name": "Nnamdi Azikiwe Library",
    "type": "academic",
    "lat": 6.8671,
    "lng": 7.3984,
    "description": "Main university library with 5 floors",
    "contact": "042-771511",
    "hours": "8:00 AM - 10:00 PM"
  },
  // Add all your buildings here...
];

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ locations: UNN_BUILDINGS });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}