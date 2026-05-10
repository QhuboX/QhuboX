// scripts/api.js

export async function checkTickerOKX(instId) {
    try {
        const response = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
        const data = await response.json();
        return data.data && data.data.length > 0;
    } catch (error) {
        console.error('Error on MENT4L:', error);
        return false;
    }
}

export async function getTickerOKX(instId) {
    try {
        const response = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
        const data = await response.json();
        return data.data[0];
    } catch (error) {
        console.error('Error on MENT4L:', error);
        return null;
    }
}