/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import debug from 'debug';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { httpAddressToString, installHttpTransport, startHttpServer } from './http.js';
import { InProcessTransport } from './inProcessTransport.js';
const serverDebug = debug('pw:mcp:server');
const errorsDebug = debug('pw:mcp:errors');
export async function connect(factory, transport, runHeartbeat) {
    const server = createServer(factory.name, factory.version, factory.create(), runHeartbeat);
    await server.connect(transport);
}
export async function wrapInProcess(backend) {
    const server = createServer('Internal', '0.0.0', backend, false);
    return new InProcessTransport(server);
}
export function createServer(name, version, backend, runHeartbeat) {
    let initializedPromiseResolve = () => { };
    const initializedPromise = new Promise(resolve => initializedPromiseResolve = resolve);
    const server = new Server({ name, version }, {
        capabilities: {
            tools: {},
        }
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        serverDebug('listTools');
        await initializedPromise;
        const tools = await backend.listTools();
        return { tools };
    });
    let heartbeatRunning = false;
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        serverDebug('callTool', request);
        await initializedPromise;
        if (runHeartbeat && !heartbeatRunning) {
            heartbeatRunning = true;
            startHeartbeat(server);
        }
        try {
            return await backend.callTool(request.params.name, request.params.arguments || {});
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: '### Result\n' + String(error) }],
                isError: true,
            };
        }
    });
    addServerListener(server, 'initialized', async () => {
        try {
            const capabilities = server.getClientCapabilities();
            let clientRoots = [];
            if (capabilities?.roots) {
                const { roots } = await server.listRoots(undefined, { timeout: 2_000 }).catch(() => ({ roots: [] }));
                clientRoots = roots;
            }
            const clientVersion = server.getClientVersion() ?? { name: 'unknown', version: 'unknown' };
            await backend.initialize?.(server, clientVersion, clientRoots);
            initializedPromiseResolve();
        }
        catch (e) {
            errorsDebug(e);
        }
    });
    addServerListener(server, 'close', () => backend.serverClosed?.(server));
    return server;
}
const startHeartbeat = (server) => {
    const beat = () => {
        Promise.race([
            server.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout')), 5000)),
        ]).then(() => {
            setTimeout(beat, 3000);
        }).catch(() => {
            void server.close();
        });
    };
    beat();
};
function addServerListener(server, event, listener) {
    const oldListener = server[`on${event}`];
    server[`on${event}`] = () => {
        oldListener?.();
        listener();
    };
}
export async function start(serverBackendFactory, options) {
    if (options.port === undefined) {
        await connect(serverBackendFactory, new StdioServerTransport(), false);
        return;
    }
    const httpServer = await startHttpServer(options);
    await installHttpTransport(httpServer, serverBackendFactory);
    const url = httpAddressToString(httpServer.address());
    const mcpConfig = { mcpServers: {} };
    mcpConfig.mcpServers[serverBackendFactory.nameInConfig] = {
        url: `${url}/mcp`
    };
    const message = [
        `Listening on ${url}`,
        'Put this in your client config:',
        JSON.stringify(mcpConfig, undefined, 2),
        'For legacy SSE transport support, you can use the /sse endpoint instead.',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.error(message);
}
