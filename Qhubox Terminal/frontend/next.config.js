/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'dd.dexscreener.com',
      'api.dexscreener.com',
      'ipfs.io',
      'arweave.net',
      'nftstorage.link',
      'cloudflare-ipfs.com',
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
