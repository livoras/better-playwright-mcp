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
const model = 'gpt-4.1';
export class OpenAIDelegate {
    _openai;
    async openai() {
        if (!this._openai) {
            const oai = await import('openai');
            this._openai = new oai.OpenAI();
        }
        return this._openai;
    }
    createConversation(task, tools, oneShot) {
        const genericTools = tools.map(tool => ({
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema,
        }));
        if (!oneShot) {
            genericTools.push({
                name: 'done',
                description: 'Call this tool when the task is complete.',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            });
        }
        return {
            messages: [{
                    role: 'user',
                    content: task
                }],
            tools: genericTools,
        };
    }
    async makeApiCall(conversation) {
        // Convert generic messages to OpenAI format
        const openaiMessages = [];
        for (const message of conversation.messages) {
            if (message.role === 'user') {
                openaiMessages.push({
                    role: 'user',
                    content: message.content
                });
            }
            else if (message.role === 'assistant') {
                const toolCalls = [];
                if (message.toolCalls) {
                    for (const toolCall of message.toolCalls) {
                        toolCalls.push({
                            id: toolCall.id,
                            type: 'function',
                            function: {
                                name: toolCall.name,
                                arguments: JSON.stringify(toolCall.arguments)
                            }
                        });
                    }
                }
                const assistantMessage = {
                    role: 'assistant'
                };
                if (message.content)
                    assistantMessage.content = message.content;
                if (toolCalls.length > 0)
                    assistantMessage.tool_calls = toolCalls;
                openaiMessages.push(assistantMessage);
            }
            else if (message.role === 'tool') {
                openaiMessages.push({
                    role: 'tool',
                    tool_call_id: message.toolCallId,
                    content: message.content,
                });
            }
        }
        // Convert generic tools to OpenAI format
        const openaiTools = conversation.tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
            },
        }));
        const openai = await this.openai();
        const response = await openai.chat.completions.create({
            model,
            messages: openaiMessages,
            tools: openaiTools,
            tool_choice: 'auto'
        });
        const message = response.choices[0].message;
        // Extract tool calls and add assistant message to generic conversation
        const toolCalls = message.tool_calls || [];
        const genericToolCalls = toolCalls.map(toolCall => {
            const functionCall = toolCall.function;
            return {
                name: functionCall.name,
                arguments: JSON.parse(functionCall.arguments),
                id: toolCall.id,
            };
        });
        // Add assistant message to generic conversation
        conversation.messages.push({
            role: 'assistant',
            content: message.content || '',
            toolCalls: genericToolCalls.length > 0 ? genericToolCalls : undefined
        });
        return genericToolCalls;
    }
    addToolResults(conversation, results) {
        for (const result of results) {
            conversation.messages.push({
                role: 'tool',
                toolCallId: result.toolCallId,
                content: result.content,
                isError: result.isError,
            });
        }
    }
    checkDoneToolCall(toolCall) {
        if (toolCall.name === 'done')
            return toolCall.arguments.result;
        return null;
    }
}
