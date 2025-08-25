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
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ListRootsRequestSchema, PingRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const errorsDebug = debug('pw:mcp:errors');
export class ProxyBackend {
    _mcpProviders;
    _currentClient;
    _contextSwitchTool;
    _roots = [];
    constructor(mcpProviders) {
        this._mcpProviders = mcpProviders;
        this._contextSwitchTool = this._defineContextSwitchTool();
    }
    async initialize(server, clientVersion, roots) {
        this._roots = roots;
        await this._setCurrentClient(this._mcpProviders[0]);
    }
    async listTools() {
        const response = await this._currentClient.listTools();
        if (this._mcpProviders.length === 1)
            return response.tools;
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
    serverClosed() {
        void this._currentClient?.close().catch(errorsDebug);
    }
    async _callContextSwitchTool(params) {
        try {
            const factory = this._mcpProviders.find(factory => factory.name === params.name);
            if (!factory)
                throw new Error('Unknown connection method: ' + params.name);
            await this._setCurrentClient(factory);
            return {
                content: [{ type: 'text', text: '### Result\nSuccessfully changed connection method.\n' }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `### Result\nError: ${error}\n` }],
                isError: true,
            };
        }
    }
    _defineContextSwitchTool() {
        return {
            name: 'browser_connect',
            description: [
                'Connect to a browser using one of the available methods:',
                ...this._mcpProviders.map(factory => `- "${factory.name}": ${factory.description}`),
            ].join('\n'),
            inputSchema: zodToJsonSchema(z.object({
                name: z.enum(this._mcpProviders.map(factory => factory.name)).default(this._mcpProviders[0].name).describe('The method to use to connect to the browser'),
            }), { strictUnions: true }),
            annotations: {
                title: 'Connect to a browser context',
                readOnlyHint: true,
                openWorldHint: false,
            },
        };
    }
    async _setCurrentClient(factory) {
        await this._currentClient?.close();
        this._currentClient = undefined;
        const client = new Client({ name: 'Playwright MCP Proxy', version: '0.0.0' });
        client.registerCapabilities({
            roots: {
                listRoots: true,
            },
        });
        client.setRequestHandler(ListRootsRequestSchema, () => ({ roots: this._roots }));
        client.setRequestHandler(PingRequestSchema, () => ({}));
        const transport = await factory.connect();
        await client.connect(transport);
        this._currentClient = client;
    }
}
