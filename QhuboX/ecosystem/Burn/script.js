// Importaciones modernas directamente desde ESM.sh para el navegador
import { Connection, PublicKey, Transaction, clusterApiUrl } from 'https://esm.sh/@solana/web3.js@1.95.4';
import { getAssociatedTokenAddress, createBurnInstruction, getAccount } from 'https://esm.sh/@solana/spl-token@0.3.9';

// ==========================================
// ⚙️ CONFIGURACIÓN DEL CONTRATO QHUBX
// ==========================================
// REEMPLAZA ESTO CON EL MINT REAL DE TU TOKEN QHUBX
const TOKEN_MINT_ADDRESS = 'TU_TOKEN_MINT_AQUI'; 
const TOKEN_DECIMALS = 9; // Cámbialo si tu token tiene más o menos decimales (ej. 6)

// Cambia 'devnet' a 'mainnet-beta' cuando vayas a lanzar el incinerador real
const NETWORK = 'devnet'; 
// ==========================================

document.addEventListener("DOMContentLoaded", function() {
    const connectWalletBtn = document.getElementById("connect-wallet");
    const playBtn = document.getElementById("play");
    const walletStatus = document.getElementById("wallet-status");
    const balanceStatus = document.getElementById("qhubx-balance");
    const ruletaImg = document.getElementById("ruleta");
    const resultadoDiv = document.getElementById("resultado");
    const apuestaInput = document.getElementById("apuesta");

    // Sonidos (Opcionales, asegúrate de que existan)
    const sonidoGiro = new Audio("assets/sounds/nido_giroso.mp3");
    const sonidoPerdedor = new Audio("assets/sounds/sonido_perdedor.mp3");

    let quemando = false;
    let userAtaAddress = null;
    let connection = new Connection(clusterApiUrl(NETWORK), 'confirmed');
    let provider = null;

    // Detectar Phantom Provider
    const getProvider = () => {
        if ('solana' in window) {
            const provider = window.solana;
            if (provider.isPhantom) return provider;
        }
        return null;
    };

    // Actualizar Balance del usuario
    const updateBalance = async (walletPubKey) => {
        try {
            balanceStatus.style.display = "block";
            balanceStatus.textContent = "Balance: Consulting...";
            
            const mintPubkey = new PublicKey(TOKEN_MINT_ADDRESS);
            // Obtener la cuenta asociada del token (ATA) del usuario
            userAtaAddress = await getAssociatedTokenAddress(mintPubkey, walletPubKey);
            
            const accountInfo = await getAccount(connection, userAtaAddress);
            const balanceReal = Number(accountInfo.amount) / Math.pow(10, TOKEN_DECIMALS);
            balanceStatus.textContent = `Balance: ${balanceReal.toFixed(2)} QHUBX`;
        } catch (error) {
            console.error("Token account not found or is empty.", error);
            balanceStatus.textContent = "Balance: 0 QHUBX";
            userAtaAddress = null;
        }
    };

    // Conectar / Desconectar
    connectWalletBtn.addEventListener("click", async () => {
        provider = getProvider();
        if (!provider) {
            alert("Please install Phantom Wallet to burn tokens!");
            window.open("https://phantom.app/", "_blank");
            return;
        }

        try {
            if (!provider.isConnected) {
                const resp = await provider.connect();
                console.log("Wallet connected:", resp.publicKey.toString());
                walletStatus.textContent = `${resp.publicKey.toString().slice(0, 4)}...${resp.publicKey.toString().slice(-4)}`;
                connectWalletBtn.textContent = "Disconnect";
                
                await updateBalance(resp.publicKey);
            } else {
                await provider.disconnect();
                walletStatus.textContent = "Wallet not connected";
                connectWalletBtn.textContent = "Connect Wallet";
                balanceStatus.style.display = "none";
                userAtaAddress = null;
            }
        } catch (err) {
            console.error("Error with the wallet:", err);
        }
    });

    // Lógica del Botón de Quemado
    playBtn.addEventListener("click", async () => {
        if (quemando) return;
        
        provider = getProvider();
        if (!provider || !provider.isConnected) {
            alert("First, you need to connect your wallet to authorize the burn.");
            return;
        }

        const cantidadQuemar = parseFloat(apuestaInput.value);
        if (isNaN(cantidadQuemar) || cantidadQuemar <= 0) {
            alert("Enter a valid amount greater than 0.");
            return;
        }

        if (!userAtaAddress) {
            alert("You don't have QHUBX tokens in your wallet to burn.");
            return;
        }

        try {
            quemando = true;
            playBtn.disabled = true;
            resultadoDiv.style.display = "none";
            
            // Animación visual mientras se firma
            ruletaImg.classList.add('girando');
            sonidoGiro.play().catch(e => console.log('Unattended audio'));

            // Construir Transacción
            const mintPubkey = new PublicKey(TOKEN_MINT_ADDRESS);
            // Convertir cantidad a la unidad cruda de la blockchain (lamports del token)
            const amountRaw = BigInt(Math.floor(cantidadQuemar * Math.pow(10, TOKEN_DECIMALS)));

            const tx = new Transaction().add(
                createBurnInstruction(
                    userAtaAddress,   // Cuenta desde donde se quema (la del usuario)
                    mintPubkey,       // El contrato del token
                    provider.publicKey, // El dueño que autoriza
                    amountRaw         // Cantidad exacta a destruir
                )
            );

            tx.feePayer = provider.publicKey;
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;

            // Solicitar firma al usuario (Aquí salta la ventana de Phantom)
            const { signature } = await provider.signAndSendTransaction(tx);
            console.log("Transaction signature:", signature);

            resultadoDiv.style.display = "block";
            resultadoDiv.style.color = "#ffff44";
            resultadoDiv.textContent = `Confirming burn on the blockchain...`;

            // Esperar a que la blockchain confirme la quema
            await connection.confirmTransaction(signature, 'confirmed');

            // Éxito
            ruletaImg.classList.remove('girando');
            resultadoDiv.style.color = "#00ffcc";
            resultadoDiv.innerHTML = `🔥¡SUCCESSFUL BURN!🔥<br><a href="https://explorer.solana.com/tx/${signature}?cluster=${NETWORK}" target="_blank" style="color: #fff; font-size: 0.8rem; text-decoration: underline;">View Transaction</a>`;
            sonidoPerdedor.play().catch(e => console.log('Unattended audio'));
            
            lanzarConfettiQUEMADO();
            await updateBalance(provider.publicKey); // Actualizar balance

        } catch (error) {
            console.error("Error al quemar:", error);
            ruletaImg.classList.remove('girando');
            resultadoDiv.style.display = "block";
            resultadoDiv.style.color = "#ff4444";
            resultadoDiv.textContent = `Error or Transaction cancelled.`;
        } finally {
            quemando = false;
            playBtn.disabled = false;
        }
    });

    function lanzarConfettiQUEMADO() {
        const confettiContainer = document.getElementById("confetti-container");
        const shapes = ["❤️‍🔥", "🔥", "🔥", "⊹₊🔥", "💥", "🗣BURNED🔥"];
        const colors = ["#00ffcc", "#ff4444", "#cc00ff", "#ff9900"];

        for (let r = 0; r < 3; r++) {
            setTimeout(() => {
                for (let i = 0; i < 30; i++) {
                    const confetti = document.createElement("div");
                    const shape = shapes[Math.floor(Math.random() * shapes.length)];
                    confetti.textContent = shape;
                    confetti.style.position = "absolute";
                    confetti.style.fontSize = `${Math.random() * 24 + 16}px`;
                    confetti.style.color = colors[Math.floor(Math.random() * colors.length)];
                    confetti.style.top = `-50px`; 
                    confetti.style.left = `${Math.random() * 89}vw`;
                    confetti.style.opacity = "1";
                    confetti.style.zIndex = "9999";
                    confetti.style.transition = "top 4s ease-out, opacity 1s ease-in";

                    setTimeout(() => {
                        confetti.style.top = `${Math.random() * 80 + 20}vh`; 
                    }, 50);

                    confettiContainer.appendChild(confetti);

                    setTimeout(() => { confetti.style.opacity = "0"; }, 4000);
                    setTimeout(() => { confetti.remove(); }, 5000);
                }
            }, r * 300); 
        }
    }
});