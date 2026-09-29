import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'export',
  basePath: '/test-intern-radar',
  trailingSlash: true,
  images: { unoptimized: true },
};
export default config;
