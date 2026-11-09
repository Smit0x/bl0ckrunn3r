/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // This is an EVM-only app, but Privy's SDK top-level imports its optional
    // Solana/Farcaster peer deps. Stub them out so the build doesn't try to resolve them.
    const optionalPeers = [
      '@farcaster/mini-app-solana',
      '@solana/kit',
      'permissionless',
      '@solana-program/memo',
      '@solana-program/token',
      '@solana-program/system',
      '@abstract-foundation/agw-client',
    ];
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    for (const pkg of optionalPeers) {
      config.resolve.alias[pkg] = false;
    }
    return config;
  },
};

export default nextConfig;
