const assert = require('assert').strict;
const clone = require('clone');
const deepEqual = require('deep-equal');
const jsonDiff = require('jsondiffpatch');
const ineficeFac = require('../index');

const tests = [
    {
        name: 'gets value on link',
        steps: [
            async (transport, server) => {
                const client1 = transport.buildFakeClient('client1');
                const client2 = transport.buildFakeClient('client2');
                const client3 = transport.buildFakeClient('client3');
                
                server.data['foo'] = 'abc';
                await server.link(client1, 'foo');
                await server.link(client3, 'foo');
            },
            {
                client: ['client1', 'client3'],
                message: {
                    op: 'init',
                    key: 'foo',
                    value: 'abc'
                }
            }
        ]
    },
    {
        name: 'change with no subscriber is no problem',
        steps: [
            async (transport, server) => {
                server.data['foo'] = { bar: 'abc' };
                server.data['foo'].bar = 'def';
            }
        ]
    },
    {
        name: 'value set sends update',
        steps: [
            async (transport, server) => {
                server.data['foo'] = 'abc';
                
                const client1 = transport.buildFakeClient('client1');
                const client2 = transport.buildFakeClient('client2');
                const client3 = transport.buildFakeClient('client3');
                
                await server.link(client1, 'foo');
                await server.link(client3, 'foo');
                
                transport.clearMessages();
                
                server.data['foo'] = 'def';
            },
            {
                client: ['client1', 'client3'],
                message: {
                    op: 'update',
                    key: 'foo',
                    path: [],
                    value: 'def'
                }
            }
        ]
    },
    {
        name: 'field add sends update',
        steps: [
            async (transport, server) => {
                server.data['foo'] = {};
                
                const client1 = transport.buildFakeClient('client1');
                const client2 = transport.buildFakeClient('client2');
                const client3 = transport.buildFakeClient('client3');
                
                await server.link(client1, 'foo');
                await server.link(client3, 'foo');
                
                transport.clearMessages();
                
                server.data['foo'].abc = 'def';
            },
            {
                client: ['client1', 'client3'],
                message: {
                    op: 'insert',
                    key: 'foo',
                    path: ['abc'],
                    value: 'def'
                }
            }
        ]
    },
    {
        name: 'field remove sends update',
        steps: [
            async (transport, server) => {
                server.data['foo'] = { abc: 'def' };
                
                const client1 = transport.buildFakeClient('client1');
                const client2 = transport.buildFakeClient('client2');
                const client3 = transport.buildFakeClient('client3');
                
                await server.link(client1, 'foo');
                await server.link(client3, 'foo');
                
                transport.clearMessages();
                
                delete server.data['foo'].abc;
            },
            {
                client: ['client1', 'client3'],
                message: {
                    op: 'delete',
                    key: 'foo',
                    path: ['abc']
                }
            }
        ]
    },
    {
        name: 'array insert sends update',
        steps: [
            async (transport, server) => {
                server.data['foo'] = ['a', 'b'];
                
                const client1 = transport.buildFakeClient('client1');
                const client2 = transport.buildFakeClient('client2');
                const client3 = transport.buildFakeClient('client3');
                
                await server.link(client1, 'foo');
                await server.link(client3, 'foo');
                
                transport.clearMessages();
                
                delete server.data['foo'].push('c');
            },
            {
                client: ['client1', 'client3'],
                message: {
                    op: 'insert',
                    key: 'foo',
                    path: [2],
                    value: 'c'
                }
            }
        ]
    },
    {
        name: 'array remove sends update',
        steps: [
            async (transport, server) => {
                server.data['foo'] = ['a', 'b', 'c'];
                
                const client1 = transport.buildFakeClient('client1');
                const client2 = transport.buildFakeClient('client2');
                const client3 = transport.buildFakeClient('client3');
                
                await server.link(client1, 'foo');
                await server.link(client3, 'foo');
                
                transport.clearMessages();
                
                server.data['foo'].shift();
            },
            {
                client: ['client1', 'client3'],
                message: {
                    op: 'delete',
                    key: 'foo',
                    path: [0]
                }
            }
        ]
    },
    {
        name: 'array sort sends update',
        steps: [
            async (transport, server) => {
                server.data['foo'] = { bar: ['a', 'c', 'b'] };
                
                const client1 = transport.buildFakeClient('client1');
                const client2 = transport.buildFakeClient('client2');
                const client3 = transport.buildFakeClient('client3');
                
                await server.link(client1, 'foo');
                await server.link(client3, 'foo');
                
                transport.clearMessages();
                
                server.data.foo.bar.sort();
            },
            {
                client: ['client1', 'client3'],
                message: {
                    op: 'update',
                    key: 'foo',
                    path: ['bar'],
                    value: ['a', 'b', 'c']
                }
            }
        ]
    },
    {
        name: 'array reverse sends update',
        steps: [
            async (transport, server) => {
                server.data['foo'] = { bar: ['a', 'b', 'c'] };
                
                const client1 = transport.buildFakeClient('client1');
                const client2 = transport.buildFakeClient('client2');
                const client3 = transport.buildFakeClient('client3');
                
                await server.link(client1, 'foo');
                await server.link(client3, 'foo');
                
                transport.clearMessages();
                
                server.data.foo.bar.reverse();
            },
            {
                client: ['client1', 'client3'],
                message: {
                    op: 'update',
                    key: 'foo',
                    path: ['bar'],
                    value: ['c', 'b', 'a']
                }
            }
        ]
    },
    {
        name: 'array splice sends messages',
        steps: [
            async (transport, server) => {
                server.data['foo'] = { bar: ['a', 'b', 'c', 'd', 'e'] };
                
                const client1 = transport.buildFakeClient('client1');
                const client2 = transport.buildFakeClient('client2');
                const client3 = transport.buildFakeClient('client3');
                
                await server.link(client1, 'foo');
                await server.link(client3, 'foo');
                
                transport.clearMessages();
                
                server.data.foo.bar.splice(1, 2, 'x', 'y', 'z');
            },
            {
                client: ['client1', 'client3'],
                
                // TODO: instrument test framework so we can accurately express
                //       that the order here doesn't matter and make this test
                //       less change-detector-y.
                message: [
                    {
                        op: 'update',
                        key: 'foo',
                        path: ['bar', 1],
                        value: 'x'
                    },
                    {
                        op: 'update',
                        key: 'foo',
                        path: ['bar', 2],
                        value: 'y'
                    },
                    {
                        op: 'insert',
                        key: 'foo',
                        path: ['bar', 3],
                        value: 'z'
                    }
                ]
            }
        ]
    },
    {
        name: 'remove root sends finalize and future changes not sent',
        steps: [
            async (transport, server) => {
                server.data['foo'] = {};
                
                const client1 = transport.buildFakeClient('client1');
                const client2 = transport.buildFakeClient('client2');
                const client3 = transport.buildFakeClient('client3');
                
                await server.link(client1, 'foo');
                await server.link(client3, 'foo');
                
                transport.clearMessages();
                
                delete server.data['foo'];
                server.data.foo = {};
            },
            {
                client: ['client1', 'client3'],
                message: {
                    op: 'finalize',
                    key: 'foo'
                }
            }
        ]
    },
    {
        name: 'link non-existent root is an error',
        steps: [
            async (transport, server) => {
                const client1 = transport.buildFakeClient('client1');
                try {
                    await server.link(client1, 'foo');
                    throw new Error('did not get expected error');
                }
                catch (e) {
                    if (!e.message.toLowerCase().includes('no such')) {
                        throw new Error('unexpected error: ' + e.message);
                    }
                }
            }
        ]
    },
    {
        name: 'unrepresentable elements become undefined during init',
        steps: [
            async (transport, server) => {
                server.data['foo'] = {
                    arrayElement: ['abc', () => {}, 'def'],
                    objectField: () => {}
                };
                server.data['topLevel'] = () => {};
                const client1 = transport.buildFakeClient('client1');

                await server.link(client1, 'foo');
                await server.link(client1, 'topLevel');
            },
            {
                client: 'client1',
                message: [
                    {
                        op: 'init',
                        key: 'foo',
                        value: {
                            arrayElement: ['abc', undefined, 'def'],
                            objectField: undefined
                        }
                    },
                    {
                        op: 'init',
                        key: 'topLevel',
                        value: undefined
                    }
                ]
            }
        ]
    },
    {
        name: 'unrepresentable elements become undefined during update',
        steps: [
            async (transport, server) => {
                server.data['foo'] = {
                    arrayElement: ['abc', 'ghi', 'def'],
                    objectField: 'jkl'
                };
                server.data['topLevel'] = 'mno';
                const client1 = transport.buildFakeClient('client1');

                await server.link(client1, 'foo');
                await server.link(client1, 'topLevel');
                
                transport.clearMessages();
                
                server.data.foo.arrayElement[1] = () => {};
                server.data.foo.objectField = () => {};
                server.data.topLevel = () => {};
            },
            {
                client: 'client1',
                message: [
                    {
                        op: 'update',
                        key: 'foo',
                        path: ['arrayElement', 1],
                        value: undefined
                    },
                    {
                        op: 'update',
                        key: 'foo',
                        path: ['objectField'],
                        value: undefined
                    },
                    {
                        op: 'update',
                        key: 'topLevel',
                        path: [],
                        value: undefined
                    }
                ]
            }
        ]
    }
];

async function test() {
    await forEachAsync(tests, async test => {
        const transport = buildFakeTransport();
        const server = ineficeFac({ transport });
    
        try {
            await forEachAsync(test.steps, async step => {
                if (typeof step === 'function') {
                    await step(transport, server);
                }
                else {
                    let clients = step.client;
                    if (typeof clients === 'string') {
                        clients = [clients];
                    }
                    
                    let messages = step.message;
                    if (!Array.isArray(messages)) {
                        messages = [messages];
                    }
                    
                    clients.forEach(client => {
                        messages.forEach(message => {
                            transport.assertMessage(client, message);
                        });
                    });
                }
            });
            
            transport.assertNoFurtherMessages();
        }
        catch (e) {
            if (e.assertionError) {
                console.log(`Test failed - "${test.name}":`);
                console.log(e.message);

                if (typeof e.expected !== 'undefined' &&
                        typeof e.actual !== 'undefined') {
                    const diff = jsonDiff.diff(e.expected, e.actual);

                    if (!diff) {
                        console.log('\nExpected:');
                        console.log(e.expected);
                        console.log('\nGot:');
                        console.log(e.actual);
                    }
                    else {
                        console.log(jsonDiff.formatters.console.format(diff));
                        console.log();
                        console.log('Full actual message:');
                        console.log(JSON.stringify(e.actual, null, 2));
                    }
                }
                else if (typeof e.expected !== 'undefined') {
                    console.log('Expected:');
                    console.log(JSON.stringify(e.expected, null, 4));
                }
                else if (typeof e.actual !== 'undefined') {
                    console.log('Got:');
                    console.log(JSON.stringify(e.actual, null, 4));
                }
                else {
                    throw new Error();
                }
                
                process.exit(1);
            }
            else {
                throw e;
            }
        }
    });
}

test().catch(e => { console.log(e); });

// ######################
// ## Helper Functions ##
// ######################

function buildFakeTransport() {
    const clients = {};
    const listeners = {
        disconnect: []
    };

    return {
        buildFakeClient(name) {
            if (typeof clients[name] !== 'undefined') {
                throw new Error();
            }
        
            clients[name] = {
                messages: []
            };
            
            return { name };
        },
        assertMessage(client, expectedMessage) {
            if (typeof client === 'string') {
                client = { name: client };
            }
        
            const messages = clients[client.name].messages;
            
            if (messages.length === 0) {
                const e =
                        new Error('Expecting a message, but there were none.');
                e.expected = expectedMessage;
                e.assertionError = true;
                
                throw e;
            }
            else {
                const actualMessage = messages.shift();
                
                if (!deepEqual(actualMessage, expectedMessage)) {
                    const e = new Error(`Message not as expected to client ` +
                            `${client.name}.`);
                    e.expected = expectedMessage;
                    e.actual = actualMessage;
                    e.assertionError = true;
                    
                    throw e;
                }
            }
        },
        assertNoFurtherMessages() {
            Object.keys(clients).forEach(client => {
                const messages = clients[client].messages;
                
                if (messages.length > 0) {
                    const e = new Error(`Unexpected message(s) to ${client}.`);
                    e.actual = messages;
                    e.assertionError = true;
                    
                    throw e;
                }
            });
        },
        clearMessages() {
            Object.keys(clients).forEach(client => {
                clients[client].messages = [];
            });
        },
        
        send(client, message) {
            message = clone(message);
            if (message.value) {
                message.value = ineficeFac._deserialize(message.value);
            }
        
            clients[client.name].messages.push(clone(message));
        },
        on(eventName, handler) {
            if (typeof listeners[eventName] === 'undefined') {
                throw new Error();
            }
            
            listeners[eventName].push(handler);
        },
        id(client) {
            return client.name; 
        }
    };
}

async function forEachAsync(a, f) {
    for (let i = 0; i < a.length; i++) {
        await f(a[i], i, a);
    }
};
