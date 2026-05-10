// Este código es un servidor simple en Node.js que utiliza Express.
// Su función es actuar como el "backend" del casino de Solana.
// Maneja la lógica del juego, recibe las apuestas y paga los premios.

// Importaciones necesarias para el servidor
const express = require('express');
const { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL, Keypair, SystemProgram, Transaction } = require('@solana/web3.js');
const cors = require('cors');

// Inicializar la aplicación Express y el puerto del servidor
const app = express();
const port = 8000;

// Configurar middlewares
app.use(cors()); // Permite peticiones desde tu frontend
app.use(express.json()); // Permite que el servidor entienda el formato JSON

// === Configuración de la cartera del casino ===
// IMPORTANTE: En un entorno de producción, la clave privada debe estar segura
// en un archivo de entorno (.env) y no debe ser generada de esta manera.
const casinoKeypair = Keypair.generate();
const casinoWallet = casinoKeypair.publicKey;
console.log('🎉 Wallet del Casino generada:', casinoWallet.toBase58());
console.log('Por favor, envía SOL de prueba a esta dirección para que el casino pueda pagar los premios.');

// Mantener un registro de las firmas de transacción para evitar procesar la misma apuesta varias veces
const processedSignatures = new Set();

// === Endpoints de la API ===

// 1. Endpoint para obtener la dirección de la cartera del casino
// Tu script.js en el frontend necesita esta dirección para enviar las apuestas.
app.get('/casino-wallet', (req, res) => {
    res.json({ casinoWallet: casinoWallet.toString() });
});

// 2. Endpoint para procesar una apuesta
// Este endpoint es llamado por el frontend después de que el usuario hace una apuesta.
app.post('/apostar', async (req, res) => {
    const { signature } = req.body;

    // Verificar si la transacción ya fue procesada
    if (processedSignatures.has(signature)) {
        console.warn(`Transacción con firma ${signature} ya fue procesada.`);
        return res.status(400).json({ error: 'Transacción ya procesada' });
    }

    try {
        const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
        const transaction = await connection.getTransaction(signature, {
            commitment: 'confirmed'
        });

        // Validar si la transacción existe y fue exitosa
        if (!transaction || transaction.meta.err) {
            console.error('Transacción de apuesta fallida o no encontrada.');
            return res.status(400).json({ error: 'Transacción de apuesta fallida o no encontrada' });
        }

        // Extraer los datos de la transacción
        const feePayer = transaction.transaction.message.accountKeys[0];
        // Calcular el monto apostado (se asume que es el cambio de saldo del pagador)
        const amount = transaction.meta.preBalances[0] - transaction.meta.postBalances[0] - transaction.meta.fee;

        // Simular el resultado del juego (50% de probabilidad de ganar)
        const esGanador = Math.random() > 0.5;
        let premio = 0;
        let resultado = 'Perdiste.';
        
        if (esGanador) {
            premio = amount * 2; // El premio es el doble de la apuesta
            resultado = '¡Ganaste!';
            
            // Pagar el premio al jugador
            const payoutTransaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: casinoWallet,
                    toPubkey: feePayer,
                    lamports: premio,
                })
            );
            
            payoutTransaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
            payoutTransaction.feePayer = casinoWallet;
            
            // El servidor firma la transacción de pago con su clave privada
            payoutTransaction.sign(casinoKeypair);

            await connection.sendRawTransaction(payoutTransaction.serialize());
            console.log(`Transacción de premio enviada. Monto: ${premio / LAMPORTS_PER_SOL} SOL a ${feePayer.toBase58()}`);
        } else {
            console.log(`El jugador ${feePayer.toBase58()} perdió. Apuesta: ${amount / LAMPORTS_PER_SOL} SOL.`);
        }

        // Añadir la firma a la lista para evitar repeticiones
        processedSignatures.add(signature);
        
        // Enviar la respuesta al frontend
        res.json({
            resultado: resultado,
            premio: premio / LAMPORTS_PER_SOL,
            signature: signature,
        });

    } catch (error) {
        console.error('Error al procesar la transacción:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`✅ Servidor escuchando en http://localhost:${port}`);
});
