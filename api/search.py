const UNN_BUILDINGS = [
  // Same buildings array as above
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET') {
    const query = req.query.q?.toLowerCase() || '';
    
    if (!query) {
      return res.status(200).json({ locations: UNN_BUILDINGS });
    }
    
    const results = UNN_BUILDINGS.filter(building => 
      building.name.toLowerCase().includes(query) ||
      building.description.toLowerCase().includes(query) ||
      building.type.toLowerCase().includes(query)
    );
    
    res.status(200).json({ locations: results });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}