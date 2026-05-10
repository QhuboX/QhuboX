const express = require('express');
const cors = require('cors');
const { Connection, clusterApiUrl, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para permitir peticiones de origen cruzado
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Configuración del servidor y de Solana ---

// Genera un nuevo keypair para la wallet del casino.
// En un entorno de producción, esta clave privada debería ser manejada de forma segura
// (por ejemplo, con variables de entorno o un servicio de gestión de secretos).
const casinoKeypair = Keypair.generate();
const casinoWallet = casinoKeypair.publicKey;

console.log('Servidor del casino Solana en funcionamiento!');
console.log(`Casino Wallet Public Key: ${casinoWallet.toBase58()}`);

// Configura la conexión a la red de Solana (Devnet para pruebas)
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

// Función auxiliar para simular el airdrop (solo para devnet)
async function airdropIfNeeded(publicKey) {
    const balance = await connection.getBalance(publicKey);
    if (balance < 0.1 * LAMPORTS_PER_SOL) {
        console.log('Airdropping 1 SOL to casino wallet...');
        const airdropSignature = await connection.requestAirdrop(publicKey, 1 * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(airdropSignature);
        console.log('Airdrop exitoso!');
    }
}
// Haz un airdrop a la wallet del casino al iniciar el servidor (solo en devnet)
airdropIfNeeded(casinoWallet);

// --- Endpoints de la API ---

// Endpoint de verificación simple
app.get('/', (req, res) => {
    res.send('Servidor del casino Solana en funcionamiento!');
});

// Nuevo endpoint para que el cliente obtenga la wallet del casino
app.get('/casino-wallet', (req, res) => {
    res.json({ casinoWallet: casinoWallet.toBase58() });
});

// Endpoint principal para procesar una apuesta
app.post('/apostar', async (req, res) => {
    const { signature } = req.body;

    if (!signature) {
        return res.status(400).json({ error: 'Falta la firma de la transacción' });
    }

    try {
        // Espera a que la transacción sea confirmada en el blockchain
        await connection.confirmTransaction(signature, 'confirmed');

        // Obtiene los detalles de la transacción para verificar los datos
        const tx = await connection.getParsedTransaction(signature, 'confirmed');
        if (!tx) {
            return res.status(404).json({ error: 'Transacción no encontrada' });
        }

        const playerWallet = tx.transaction.message.accountKeys[0];
        const lamportsSent = tx.meta.postBalances[0] - tx.meta.preBalances[0];
        const montoApostado = lamportsSent / LAMPORTS_PER_SOL;

        // Verifica que la transacción sea válida y se haya enviado al casino
        if (!tx.meta.logMessages.some(log => log.includes(casinoWallet.toBase58()))) {
             return res.status(400).json({ error: 'La transacción no se envió al casino' });
        }
        
        // Simulación de la lógica de la apuesta (el servidor decide el resultado)
        const premios = [
            { nombre: "0.5 SOL", probabilidad: 0.05, multiplicador: 0.5 },
            { nombre: "2 SOL", probabilidad: 0.02, multiplicador: 2 },
            { nombre: "10 SOL", probabilidad: 0.005, multiplicador: 10 },
        ];
        
        const rand = Math.random();
        let resultado = "Perdiste";
        let premio = 0;
        let acumulado = 0;

        for (const p of premios) {
            acumulado += p.probabilidad;
            if (rand < acumulado) {
                resultado = `Ganaste: ${p.nombre}`;
                premio = montoApostado * p.multiplicador;
                break;
            }
        }
        
        // Si el jugador ganó, transfiere el premio
        if (premio > 0) {
            const payoutTransaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: casinoWallet,
                    toPubkey: playerWallet,
                    lamports: premio * LAMPORTS_PER_SOL,
                })
            );

            // La transacción de pago debe ser firmada por el casino
            const payoutSignature = await connection.sendTransaction(payoutTransaction, [casinoKeypair]);
            await connection.confirmTransaction(payoutSignature);

            console.log(`El jugador ${playerWallet.toBase58()} ganó ${premio} SOL. Transacción de pago: ${payoutSignature}`);
            return res.json({ resultado, premio, payoutSignature });
        }

        console.log(`El jugador ${playerWallet.toBase58()} perdió.`)
        res.json({ resultado, premio });

    } catch (err) {
        console.error('Error al procesar la apuesta:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor de casino escuchando en http://localhost:${PORT}`);
});
