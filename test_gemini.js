const fs = require('fs');
const fetch = require('node-fetch');
const envStr = fs.readFileSync('.env', 'utf8');
const apiKeyLine = envStr.split('\n').find(l => l.startsWith('EXPO_PUBLIC_GEMINI_API_KEY='));
const apiKey = apiKeyLine.split('=')[1].trim();

const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' + apiKey;
const body = {
  contents: [{ parts: [{ text: 'Busca en internet el tipo de cambio del dolar en México del 10 de Mayo de 2024. Devuelve un JSON puro con {"tipo_cambio": number}' }] }],
  tools: [{ googleSearch: {} }],
  generationConfig: { responseMimeType: 'application/json' }
};
fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(res => res.json())
  .then(json => console.log(JSON.stringify(json, null, 2)))
  .catch(err => console.error(err));
