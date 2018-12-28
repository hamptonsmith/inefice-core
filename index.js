const Observable = require('object-observer');
const sejr = new (require('@shieldsbetter/sejr'))({
    clientType: (v, pfn) => {
        switch (typeof v) {
            case 'boolean':
            case 'number':
            case 'string':
            case 'object': {
                return pfn(v);
            }
            default: {
                return 'undefined'
            }
        }
    },
    typeDefinitions: {
        'undefined': {
            describe: v => undefined,
            realize: {
                fromUndefined: () => {}
            }
        }
    }
});

module.exports = ({ transport }) => {
    const data = Observable.from({});
    const subscriberState = new SubscriberState(transport, data);
    
    data.observe(changes => changes.forEach(change => {
        const rootObjectName = change.path[0];
        
        let message;
        if (change.type === 'delete' && change.path.length === 1) {
            // This is a root object deletion.  We treat this specially since we
            // want to signal to clients that further updates about this root
            // object key will not be delivered even if the object becomes
            // re-established later.
            
            message = {
                op: 'finalize',
                key: rootObjectName
            };
        }
        else {
            const changeType = changeTypes[change.type];
            message = changeType.buildMessage(change, data);
        }
        
        subscriberState.sendObjectUpdate(rootObjectName, message);
        
        if (message.op === 'finalize') {
            subscriberState.clearSubscribers(rootObjectName);
        }
    }));
    
    return {
        data: data,
    
        link(client, key) {
            if (typeof data[key] === 'undefined') {
                throw new Error('No such key: ' + key);
            }
        
            subscriberState.link(client, key);
        },
        
        unlink(client, key) {
            subscriberState.unlink(client, key);
        }
    };
};

module.exports._serialize = serialize;
module.exports._deserialize = deserialize;

function withPath(d, path) {
    let cursor = d;
    path.forEach(segment => {
        if (typeof segment !== undefined) {
            cursor = cursor[segment];
        }
    });
    
    return cursor;
}

var changeTypes = (() => {
    function updateFromPath(c, data) {
        return {
            op: 'update',
            key: c.path[0],
            path: c.path.slice(1),
            value: serialize(withPath(data, c.path))
        };
    }
    
    function insertStyleUpdate(op) {
        return c => {
            const result = {
                op: op,
                key: c.path[0],
                path: c.path.slice(1)
            };
            
            if (typeof c.value !== 'undefined') {
                result.value = serialize(c.value);
            }
            
            return result;
        };
    }
    
    return {
        insert: {
            buildMessage: insertStyleUpdate('insert')
        },
        update: {
            buildMessage: insertStyleUpdate('update')
        },
        delete: {
            buildMessage: insertStyleUpdate('delete')
        },
        shuffle: {
            buildMessage: updateFromPath
        },
        reverse: {
            buildMessage: updateFromPath
        }
    };
})();

class SubscriberState {
    constructor(transport, data) {
        this.keyToSubscribedClients = new MapOfLists();
        this.clientsToSubscriptions = new MapOfLists();
        this.transport = transport;
        this.data = data;
        
        transport.on('disconnect', client => {
            this.clientsToSubscriptions.with(client).forEach(
                    key => { this.unlinkSilently(client, key); });
        });
    }
    
    unlinkSilently(client, key) {
        const newList = this.keyToSubscribedClients.with(key).filter(
                e => e !== client);
        this.keyToSubscribedClients.set(key, newList);
    }
    
    sendObjectUpdate(rootObjectName, message) {
        this.keyToSubscribedClients.with(rootObjectName).forEach(client => {
            this.transport.send(client, message);
        });
    }
    
    link(client, key) {
        this.keyToSubscribedClients.with(key).push(client);
        this.clientsToSubscriptions.with(this.transport.id(client)).push(key);
    
        this.transport.send(client, {
            op: 'init',
            key: key,
            value: serialize(this.data[key])
        });
    }
    
    unlink(client, key) {
        this.unlinkSilently(client, key);
            
        this.transport.send(client, {
            op: 'closed',
            key: key
        });
    }
    
    clearSubscribers(key) {
        this.keyToSubscribedClients.with(key).forEach(client => {
            const newSubscriptionList = this.clientsToSubscriptions.with(client)
                    .filter(e => e !== key);
            this.clientsToSubscriptions.set(client, newSubscriptionList);
        });
        
        this.keyToSubscribedClients.removeAll(key);
    }
}

function serialize(o) {
    return sejr.describe(o);
}

function deserialize(s) {
    return sejr.realize(s);
}

class MapOfLists {
    constructor() {
        this.map = {};
    }
    
    removeAll(key) {
        delete this.map[key];
    }
    
    set(key, value) {
        if (!Array.isArray(value)) {
            throw new Error('Value must be an array.  Was: ' + value);
        }
        
        if (value.length === 0) {
            delete this.map[key];
        }
        else {
            this.map[key] = value;
        }
    }
    
    with(key) {
        if (typeof this.map[key] === 'undefined') {
            this.map[key] = [];
        }
        
        return this.map[key];
    }
}
