// convertir-base58.js
const bs58 = require('bs58');
const fs = require('fs');

const base58SecretKey = 'AQUÍ_TU_CLAVE_BASE58'; // 643PL72MC6f9oE4hCEeDPPK5ceSW3fB6JJRvuSuL5ZGyN4iTct5RsNsQGYfHcPMsUcZLwv3egX4yAZF8E6W24DHZ
const secretKey = bs58.decode(base58SecretKey);

fs.writeFileSync(
  'casino-keypair.json',
  JSON.stringify({ secretKey: Array.from(secretKey) })
);

console.log('Archivo casino-keypair.json generado.');