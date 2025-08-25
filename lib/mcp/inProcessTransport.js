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
export class InProcessTransport {
    _server;
    _serverTransport;
    _connected = false;
    constructor(server) {
        this._server = server;
        this._serverTransport = new InProcessServerTransport(this);
    }
    async start() {
        if (this._connected)
            throw new Error('InprocessTransport already started!');
        await this._server.connect(this._serverTransport);
        this._connected = true;
    }
    async send(message, options) {
        if (!this._connected)
            throw new Error('Transport not connected');
        this._serverTransport._receiveFromClient(message);
    }
    async close() {
        if (this._connected) {
            this._connected = false;
            this.onclose?.();
            this._serverTransport.onclose?.();
        }
    }
    onclose;
    onerror;
    onmessage;
    sessionId;
    setProtocolVersion;
    _receiveFromServer(message, extra) {
        this.onmessage?.(message, extra);
    }
}
class InProcessServerTransport {
    _clientTransport;
    constructor(clientTransport) {
        this._clientTransport = clientTransport;
    }
    async start() {
    }
    async send(message, options) {
        this._clientTransport._receiveFromServer(message);
    }
    async close() {
        this.onclose?.();
    }
    onclose;
    onerror;
    onmessage;
    sessionId;
    setProtocolVersion;
    _receiveFromClient(message) {
        this.onmessage?.(message);
    }
}
