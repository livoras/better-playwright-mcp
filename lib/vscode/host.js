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
import { fileURLToPath } from 'url';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ListRootsRequestSchema, PingRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as mcpServer from '../mcp/server.js';
import { logUnhandledError } from '../utils/log.js';
import { packageJSON } from '../utils/package.js';
import { BrowserServerBackend } from '../browserServerBackend.js';
import { contextFactory } from '../browserContextFactory.js';
const contextSwitchOptions = z.object({
    connectionString: z.string().optional().describe('The connection string to use to connect to the browser'),
    lib: z.string().optional().describe('The library to use for the connection'),
});
class VSCodeProxyBackend {
    _config;
    _defaultTransportFactory;
    name = 'Playwright MCP Client Switcher';
    version = packageJSON.version;
    _currentClient;
    _contextSwitchTool;
    _roots = [];
    _clientVersion;
    constructor(_config, _defaultTransportFactory) {
        this._config = _config;
        this._defaultTransportFactory = _defaultTransportFactory;
        this._contextSwitchTool = this._defineContextSwitchTool();
    }
    async initialize(server, clientVersion, roots) {
        this._clientVersion = clientVersion;
        this._roots = roots;
        const transport = await this._defaultTransportFactory();
        await this._setCurrentClient(transport);
    }
    async listTools() {
        const response = await this._currentClient.listTools();
        return [
            ...response.tools,
            this._contextSwitchTool,
        ];
    }
    async callTool(name, args) {
        if (name === this._contextSwitchTool.name)
            return this._callContextSwitchTool(args);
        return await this._currentClient.callTool({
            name,
            arguments: args,
        });
    }
    serverClosed(server) {
        void this._currentClient?.close().catch(logUnhandledError);
    }
    async _callContextSwitchTool(params) {
        if (!params.connectionString || !params.lib) {
            const transport = await this._defaultTransportFactory();
            await this._setCurrentClient(transport);
            return {
                content: [{ type: 'text', text: '### Result\nSuccessfully disconnected.\n' }],
            };
        }
        await this._setCurrentClient(new StdioClientTransport({
            command: process.execPath,
            cwd: process.cwd(),
            args: [
                path.join(fileURLToPath(import.meta.url), '..', 'main.js'),
                JSON.stringify(this._config),
                params.connectionString,
                params.lib,
            ],
        }));
        return {
            content: [{ type: 'text', text: '### Result\nSuccessfully connected.\n' }],
        };
    }
    _defineContextSwitchTool() {
        return {
            name: 'browser_connect',
            description: 'Do not call, this tool is used in the integration with the Playwright VS Code Extension and meant for programmatic usage only.',
            inputSchema: zodToJsonSchema(contextSwitchOptions, { strictUnions: true }),
            annotations: {
                title: 'Connect to a browser running in VS Code.',
                readOnlyHint: true,
                openWorldHint: false,
            },
        };
    }
    async _setCurrentClient(transport) {
        await this._currentClient?.close();
        this._currentClient = undefined;
        const client = new Client(this._clientVersion);
        client.registerCapabilities({
            roots: {
                listRoots: true,
            },
        });
        client.setRequestHandler(ListRootsRequestSchema, () => ({ roots: this._roots }));
        client.setRequestHandler(PingRequestSchema, () => ({}));
        await client.connect(transport);
        this._currentClient = client;
    }
}
export async function runVSCodeTools(config) {
    const serverBackendFactory = {
        name: 'Playwright w/ vscode',
        nameInConfig: 'playwright-vscode',
        version: packageJSON.version,
        create: () => new VSCodeProxyBackend(config, () => mcpServer.wrapInProcess(new BrowserServerBackend(config, contextFactory(config))))
    };
    await mcpServer.start(serverBackendFactory, config.server);
    return;
}
