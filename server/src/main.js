// Starts the Node server: node src/main.js
import http from 'node:http';
import { buildApp, configFromEnv, nodeHandler } from './index.js';

const app = await buildApp(configFromEnv());
const port = Number(process.env.PORT) || 8080;
const server = http.createServer(nodeHandler(app));
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.listen(port, process.env.HOST || undefined, () => console.log('marsad-kpi server on :' + port));
