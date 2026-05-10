// Este script ha sido modificado para funcionar de forma completamente local,
// sin depender de un servidor externo (app.js).
// La lógica del juego ahora se ejecuta directamente en el navegador.

// Espera a que el DOM esté completamente cargado antes de ejecutar el script
document.addEventListener("DOMContentLoaded", function() {
    // Constantes y elementos del DOM
    const connectWalletBtn = document.getElementById("connect-wallet");
    const playBtn = document.getElementById("play");
    const walletStatus = document.getElementById("wallet-status");
    const ruletaImg = document.getElementById("ruleta");
    const resultadoDiv = document.getElementById("resultado");
    const apuestaInput = document.getElementById("apuesta");

    // Audio - Las rutas de los archivos de sonido han sido actualizadas
    const sonidoGiro = new Audio("assets/sounds/nido_giroso.mp3");
    const sonidoGanador = new Audio("assets/sounds/sonido_ganador.mp3");
    const sonidoPerdedor = new Audio("assets/sounds/sonido_perdedor.mp3");

    // Estado del juego
    let girando = false;

    // Lógica para el botón de Conectar/Desconectar Wallet
    // La conexión a la wallet sigue funcionando, pero no se usa para transacciones en este modo.
    connectWalletBtn.addEventListener("click", async () => {
        const provider = window.solana;
        if (!provider || !provider.isPhantom) {
            console.error("Error: The Phantom Wallet extension was not detected.");
            alert("Please install the Phantom Wallet to continue.");
            return;
        }

        try {
            if (!provider.isConnected) {
                await provider.connect();
                console.log("Wallet conectada con exito:", provider.publicKey.toString());
                walletStatus.textContent = `TO WIN: ${provider.publicKey.toString().slice(0, 4)}...${provider.publicKey.toString().slice(-4)}`;
                connectWalletBtn.textContent = "Connected";
            } else {
                await provider.disconnect();
                console.log("Wallet desconectada.");
                walletStatus.textContent = "Wallet not connected";
                connectWalletBtn.textContent = "Connect Wallet";
            }
        } catch (err) {
            console.error("Error al conectar/desconectar la wallet:", err);
            alert("Error connecting the wallet. Please try again.");
        }
    });

    // Lógica para el botón de Jugar (ahora completamente local)
    playBtn.addEventListener("click", () => {
        if (girando) return; // Evitar múltiples clics
        
        // Si no hay wallet conectada, aún podemos jugar, pero se muestra una alerta
        const provider = window.solana;
        if (!provider || !provider.publicKey) {
            alert("You will play in trial mode. No transaction will be made.");
        }

        girando = true;
        playBtn.disabled = true;
        resultadoDiv.style.display = "none";
        
        // Iniciar la animación y el sonido de giro
        ruletaImg.classList.add('girando');
        sonidoGiro.play();

        // Esperar a que la animación termine antes de mostrar el resultado
        setTimeout(() => {
            ruletaImg.classList.remove('girando');

            // === Lógica del juego completamente local ===
            // 50% de probabilidad de ganar
            const esGanador = Math.random() < 0.5; 
            const apuesta = parseFloat(apuestaInput.value);

            // Actualizar la UI con el resultado y reproducir el sonido adecuado
            if (esGanador) {
                resultadoDiv.textContent = `¡YOU WIN!🍀: ${apuesta * 2} SOL 🚀 SWAP NOW`;
                sonidoGanador.play();
               lanzarConfetti();
               

            } else {
                resultadoDiv.textContent = `📈SUCCESSFUL BURN📈`;
                sonidoPerdedor.play();
                lanzarConfettiQUEMADO()
            }
            
            resultadoDiv.style.display = "block";

            girando = false;
            playBtn.disabled = false;
        }, 2500); // La duración de la animación es 7.1s

    });


    // Función de confetti
    
    function lanzarConfetti() {
    const confettiContainer = document.getElementById("confetti-container");
    const shapes = ["✨", "💖", "🎁", "💲","🪙", "💥", "🍀"];
    const colors = ["#ff00cc", "#00ffcc", "#ffff44", "#ff4444", "#ff9900", "#00ff99", "#cc00ff"];

    // Lanzar 3 ráfagas con 300ms de diferencia
    for (let r = 0; r < 4; r++) {
        setTimeout(() => {
            for (let i = 0; i < 30; i++) {
                const confetti = document.createElement("div");
                const shape = shapes[Math.floor(Math.random() * shapes.length)];
                confetti.textContent = shape;
                confetti.style.position = "absolute";
                confetti.style.fontSize = `${Math.random() * 24 + 16}px`;
                confetti.style.color = colors[Math.floor(Math.random() * colors.length)];
                confetti.style.top = `-50px`; // Parte alta de la pantalla
                confetti.style.left = `${Math.random() * 98}vw`;
                confetti.style.opacity = "1";
                confetti.style.zIndex = "9999";
                confetti.style.transition = "top 4s ease-out, opacity 1s ease-in";

                // Movimiento hacia abajo
                setTimeout(() => {
                    confetti.style.top = `${Math.random() * 80 + 20}vh`; // Caída
                }, 50);

                confettiContainer.appendChild(confetti);

                // Desvanecimiento y limpieza
                setTimeout(() => {
                    confetti.style.opacity = "0";
                }, 4000);
                setTimeout(() => {
                    confetti.remove();
                }, 5000);
                
            }
        }, r * 300); // Espaciado entre ráfagas
        
    }
}


});

// Función de confettiQUEMADO
    ti
    function lanzarConfettiQUEMADO() {
    const confettiContainer = document.getElementById("confetti-container");
    const shapes = ["❤️‍🔥", "🔥","🔥", "⊹₊🔥", "💥", "🗣BURNED🔥",];
    const colors = [ "#00ffcc", "#ff4444",  "#cc00ff"];

    // Lanzar 3 ráfagas con 300ms de diferencia
    for (let r = 0; r < 3; r++) {
        setTimeout(() => {
            for (let i = 0; i < 30; i++) {
                const confetti = document.createElement("div");
                const shape = shapes[Math.floor(Math.random() * shapes.length)];
                confetti.textContent = shape;
                confetti.style.position = "absolute";
                confetti.style.fontSize = `${Math.random() * 24 + 16}px`;
                confetti.style.color = colors[Math.floor(Math.random() * colors.length)];
                confetti.style.top = `-50px`; // Parte alta de la pantalla
                confetti.style.left = `${Math.random() * 89}vw`;
                confetti.style.opacity = "1";
                confetti.style.zIndex = "9999";
                confetti.style.transition = "top 4s ease-out, opacity 1s ease-in";

                // Movimiento hacia abajo
                setTimeout(() => {
                    confetti.style.top = `${Math.random() * 80 + 20}vh`; // Caída
                }, 50);

                confettiContainer.appendChild(confetti);

                // Desvanecimiento y limpieza
                setTimeout(() => {
                    confetti.style.opacity = "0";
                }, 4000);
                setTimeout(() => {
                    confetti.remove();
                }, 5000);
                
            }
        }, r * 300); // Espaciado entre ráfagas
        }
        }
        ;