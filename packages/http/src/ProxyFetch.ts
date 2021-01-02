import HttpsProxyAgent from 'https-proxy-agent';
import getDefaultFetch from './getDefaultFetch';

// You can run with "NODE_TLS_REJECT_UNAUTHORIZED=0 yarn test:integration" to ignore SSL errors when proxying
const ProxyFetch = getDefaultFetch(
  process.env.HTTP_PROXY
    ? {agent: HttpsProxyAgent(process.env.HTTP_PROXY)}
    : {},
);
export default ProxyFetch;
