// scripts/ui.js

export const portfolioList = document.getElementById('portfolioList');
export const coinDetails = document.getElementById('coinDetails');
export const priceChart = document.getElementById('priceChart');
export const screen1 = document.querySelector('.screen-1');
export const screen2 = document.querySelector('.screen-2');
export const addCryptoBtn = document.getElementById('addCryptoBtn');
export const backBtn = document.getElementById('backBtn');
export const cryptoFormModal = document.getElementById('cryptoFormModal');

let myChart = null;

export function renderCard(crypto, index) {
    const card = document.createElement('div');
    card.className = 'crypto-card';
    card.id = `crypto-card-${index}`;
    // Format the values
    const formattedBuyPrice = crypto.buyPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedDate = new Date(crypto.date).toLocaleDateString('en-US');
    
    card.innerHTML = `
        <div>
            <strong>${crypto.ticker}</strong><br>
            <small>Purchase Price: $${formattedBuyPrice}</small><br>
            <small>Date: ${formattedDate}</small>
        </div>
        <div class="crypto-actions">
            <button class="edit-btn" data-index="${index}">🖋️</button>
            <button class="delete-btn" data-index="${index}">🗑️</button>
        </div>
    `;
    return card;
}

export function createChart() {
    if (myChart) {
        myChart.destroy();
    }
    const ctx = priceChart.getContext('2d');
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Price (USD)',
                data: [],
                borderColor: '#0ff',
                backgroundColor: 'rgba(248, 255, 255, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { color: '#ccc' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                },
                y: {
                    ticks: {
                        color: '#ccc',
                        callback: (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    borderColor: '#0ff',
                    borderWidth: 1,
                    titleColor: '#0ff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: (context) => `Price: $${context.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    }
                }
            }
        }
    });
    return myChart;
}

export function updateChart(chart, price) {
    const currentTime = new Date().toLocaleTimeString();
    chart.data.labels.push(currentTime);
    chart.data.datasets[0].data.push(price);

    const maxDataPoints = 30;
    if (chart.data.labels.length > maxDataPoints) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.update();
}

export function updateCoinDetails(symbol, price, change24h, vol24h, profitUSD, profitPercent) {
    // Lógica de colores
    const changeColor = change24h >= 0 ? '#00ff00' : '#ff0000';
    const profitColor = profitUSD >= 0 ? '#00ff00' : '#ff0000';

    // Formateo de valores
    const formattedPrice = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedChange24h = change24h.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    // Volumen real en USD (Volumen * Precio) con notación compacta (M, B)
    const realVolUSD = vol24h * price;
    const formattedVol24h = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 2
    }).format(realVolUSD);
    
    const roundedProfitUSD = Math.round(profitUSD).toLocaleString('en-US');
    const roundedProfitPercent = Math.round(profitPercent).toLocaleString('en-US');

    // Logo de la moneda (usando el ticker en minúsculas)
    const logoUrl = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${symbol.toLowerCase()}.png`;

    coinDetails.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <img src="${logoUrl}" alt="${symbol}" style="width: 40px; height: 40px;" onerror="this.style.display='none'">
            <h2 style="margin: 0;">${symbol}</h2>
        </div>
        <p>💲 Current Price: <strong>$${formattedPrice}</strong></p>
        <p>📈 24h Change: <strong style="color: ${changeColor}">${formattedChange24h}%</strong></p>
        <p>📊 24h Volume: <strong>${formattedVol24h}</strong></p>
        <hr>
        <p>💵 Profit: 
            <strong style="color: ${profitColor}">
                $${roundedProfitUSD} (${roundedProfitPercent}%)
            </strong>
        </p>
    `;
}

export function showLoadingError() {
    coinDetails.innerHTML = `<p style="color:red;">Error: Failed to load coin information.</p>`;
}

export function toggleScreens(showDetails) {
    screen1.style.display = showDetails ? 'none' : 'block';
    screen2.style.display = showDetails ? 'block' : 'none';
    addCryptoBtn.style.display = showDetails ? 'none' : 'block';
    backBtn.style.display = showDetails ? 'block' : 'none';
}