// frontend/src/services/backendTransactionService.js
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';

export const checkBackendStatus = async () => {
  const res = await fetch(`${BACKEND_URL}/api/status`);
  return res.json();
};

export const claimAdRewardFromBackend = async (userWallet, amount, adId) => {
  const res = await fetch(`${BACKEND_URL}/api/transactions/send-reward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientPublicKey: userWallet, amount: parseFloat(amount), adId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to claim reward');
  return data;
};

export const verifyPaymentOnBackend = async (signature, expectedAmount, expectedRecipient) => {
  const res = await fetch(`${BACKEND_URL}/api/transactions/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, expectedAmount: parseFloat(expectedAmount), expectedRecipient }),
  });
  return res.json();
};

export const getUserBalance = async userWallet => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/transactions/user-balance/${userWallet}`);
    return res.json();
  } catch {
    return { success: false, balance: 0 };
  }
};

export const getPlatformBalance = async () => {
  const res = await fetch(`${BACKEND_URL}/api/transactions/platform-balance`);
  return res.json();
};
