// scripts/app.js

import { checkTickerOKX, getTickerOKX } from './api.js';
import { 
    portfolioList, coinDetails, priceChart, screen1, screen2, 
    addCryptoBtn, backBtn, cryptoFormModal,
    renderCard, createChart, updateChart, updateCoinDetails, showLoadingError
} from './ui.js';

const cryptoForm = document.getElementById('cryptoForm');

let portfolio = [];
let portfolioUpdateInterval = null;
let realTimeInterval = null;
let myChart = null;

// --- Nueva Función de Detección de Vista Móvil ---
function isMobileView() {
    // 768px es el breakpoint definido en tu CSS
    return window.matchMedia('(max-width: 768px)').matches;
}

document.addEventListener('DOMContentLoaded', () => {
    if (screen1) screen1.style.display = 'block';
    if (screen2) screen2.style.display = 'block';
    
    // Ocultar el botón al inicio, ya que estamos en la vista principal (screen-1)
    if (backBtn) backBtn.style.display = 'none'; 
    
    loadPortfolio();
});

cryptoFormModal.addEventListener('click', (e) => {
    if (e.target === cryptoFormModal) {
        cryptoFormModal.classList.add('hidden');
        cryptoForm.reset(); 
    }
});

addCryptoBtn.onclick = () => {
    cryptoFormModal.classList.remove('hidden');
    cryptoForm.onsubmit = defaultSubmit;
};

cryptoForm.onclick = (e) => {
    e.stopPropagation();
};

async function defaultSubmit(e) {
    e.preventDefault();
    const [tickerInput, dateInput, priceInput, amountInput] = cryptoForm.querySelectorAll('input');
    const ticker = tickerInput.value;
    const instId = `${ticker.toUpperCase()}-USDT`;

    const isValidTicker = await checkTickerOKX(instId);
    if (!isValidTicker) {
        alert(`Ticker "${ticker.toUpperCase()}" not available on QhuboX`);
        return;
    }

    const crypto = {
        ticker,
        instId,
        date: dateInput.value,
        buyPrice: parseFloat(priceInput.value),
        amount: parseFloat(amountInput.value)
    };

    portfolio.push(crypto);
    await renderPortfolio();
    savePortfolio();
    cryptoFormModal.classList.add('hidden');
    cryptoForm.reset();
}

function savePortfolio() {
    localStorage.setItem('cryptoPortfolio', JSON.stringify(portfolio));
}

function loadPortfolio() {
    const savedPortfolio = localStorage.getItem('cryptoPortfolio');
    if (savedPortfolio) {
        portfolio = JSON.parse(savedPortfolio);
        renderPortfolio();
    }
}

async function updateAllCryptoCards() {
    // Función de mantenimiento
}

async function renderPortfolio() {
    if (portfolioUpdateInterval) {
        clearInterval(portfolioUpdateInterval);
    }
    
    portfolioList.innerHTML = '';
    
    const cardPromises = portfolio.map(async (crypto, index) => {
        const card = renderCard(crypto, index);
        card.onclick = () => showDetails(crypto.instId, index); 
        return card;
    });

    const cards = await Promise.all(cardPromises);
    cards.forEach(card => {
        if (card) portfolioList.appendChild(card);
    });

    portfolioList.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('delete-btn')) {
            const index = target.dataset.index;
            confirmDelete(index);
        } else if (target.classList.contains('edit-btn')) {
            const index = target.dataset.index;
            editCrypto(index);
        }
    });
}

function confirmDelete(index) {
    const crypto = portfolio[index];
    const userConfirmation = confirm(`Are you sure you want to delete ${crypto.ticker} from your portfolio?`);
    
    if (userConfirmation) {
        deleteCrypto(index);
    }
}

function deleteCrypto(index) {
    portfolio.splice(index, 1);
    renderPortfolio();
    savePortfolio();
}

function editCrypto(index) {
    const crypto = portfolio[index];
    const inputs = cryptoForm.querySelectorAll('input');
    inputs[0].value = crypto.ticker;
    inputs[1].value = crypto.date;
    inputs[2].value = crypto.buyPrice;
    inputs[3].value = crypto.amount;
    cryptoFormModal.classList.remove('hidden');

    cryptoForm.onsubmit = async (e) => {
        e.preventDefault();
        crypto.ticker = inputs[0].value.toUpperCase();
        crypto.date = inputs[1].value;
        crypto.buyPrice = parseFloat(inputs[2].value);
        crypto.amount = parseFloat(inputs[3].value);
        await renderPortfolio();
        savePortfolio();
        cryptoFormModal.classList.add('hidden');
        cryptoForm.reset(); 
        cryptoForm.onsubmit = defaultSubmit;
    };
}

async function showDetails(instId, index) {
    if (realTimeInterval) clearInterval(realTimeInterval);
    
    // --- INTERCAMBIO DE PANTALLAS EN MÓVIL ---
    if (isMobileView()) {
        screen1.classList.add('hidden-mobile'); // Oculta Screen 1
        screen2.classList.add('active');        // Muestra Screen 2
    }
    
    backBtn.style.display = 'block'; 
    
    myChart = createChart();
    
    const fetchAndUpdate = async () => {
        try {
            const tickerData = await getTickerOKX(instId);
            const selectedCoin = portfolio[index];
            
            if (!tickerData || !selectedCoin) {
                showLoadingError();
                return;
            }

            const price = parseFloat(tickerData.last);
            const symbol = instId.split('-')[0];
            const open24h = parseFloat(tickerData.open24h);
            const change24h = ((price - open24h) / open24h * 100).toFixed(2);
            const vol24h = parseFloat(tickerData.vol24h);
            const profitUSD = ((price - selectedCoin.buyPrice) * selectedCoin.amount);
            const profitPercent = ((price - selectedCoin.buyPrice) / selectedCoin.buyPrice) * 100;

            updateCoinDetails(symbol, price, change24h, vol24h, profitUSD, profitPercent);
            updateChart(myChart, price);
        } catch (error) {
            console.error('Error loading real-time data:', error);
            showLoadingError();
            clearInterval(realTimeInterval);
        }
    };

    fetchAndUpdate();
    realTimeInterval = setInterval(fetchAndUpdate, 5000);
}

backBtn.onclick = () => {
    if (realTimeInterval) clearInterval(realTimeInterval);
    if (myChart) {
        myChart.destroy();
        myChart = null;
    }
    coinDetails.innerHTML = '';
    backBtn.style.display = 'none'; 

    // --- REVERTIR INTERCAMBIO EN MÓVIL ---
    if (isMobileView()) {
        screen2.classList.remove('active');        // Oculta Screen 2
        screen1.classList.remove('hidden-mobile'); // Muestra Screen 1
    }
};
// Escuchar cuando el usuario gira el teléfono
window.addEventListener('resize', () => {
    if (!isMobileView()) {
        // Si ya no estamos en vista móvil (porque giró a horizontal o creció la pantalla)
        // Limpiamos las clases de ocultación para que se vean ambas pantallas
        screen1.classList.remove('hidden-mobile');
        screen2.classList.add('active'); // En desktop/horizontal la screen-2 siempre debe poder verse
        
        // Si hay una moneda seleccionada, nos aseguramos que el gráfico se ajuste al nuevo tamaño
        if (myChart) {
            myChart.resize();
        }
    }
});