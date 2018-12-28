'use strict';

const clone = require('clone');

const builtInClientTypes = {
    string: {
        describe: s => s,
        realize: {
            fromString: s => s
        }
    },
    number: {
        describe: n => n,
        realize: {
            fromNumber: n => n
        }
    },
    boolean: {
        describe: b => b,
        realize: {
            fromBoolean: b => b
        }
    },
    array: {
        describe: a => a,
        realize: {
            fromArray: a => a
        }
    },
    object: {
        describe: o => o,
        realize: {
            fromNull: n => n,
            fromObject: o => o
        }
    }
};

function defaultTypeof(d) {
    const typeofD = typeof d;
    
    let result;
    if (typeofD === 'object') {
        if (Array.isArray(d)) {
            result = 'array';
        }
        else {
            result = 'object';
        }
    }
    else {
        if (!isBuiltInClientType(typeofD)) {
            throw new Error(
                    `Cannot describe value "${d}" with type "${typeofD}".`);
        }
    
        result = typeofD;
    }
    
    return result;
}

module.exports = class {
    constructor(options) {
        this.options = clone(options || {});
        this.options.clientType =
                this.options.clientType || ((i, superTypeof) => superTypeof(i));
        this.options.typeDefinitions = this.options.typeDefinitions || {};
    
        Object.entries(builtInClientTypes).forEach(([typeName, definition]) => {
            if (this.options.typeDefinitions[typeName]) {
                throw new Error(
                        `May not redefine built-in type "${typeName}".`);
            }
            
            this.options.typeDefinitions[typeName] = definition;
        });
    }

    describe(d) {
        return describe(d, this.options);
    }
    
    realize(s) {
        return realize(s, this.options);
    }
};

// ####################
// ## Implementation ##
// ####################

/**
 * Maps a client object, `data`, into a sejr object.  `data` is not modified.
 */
function describe(data, options) {
    const dataClientTypeName = options.clientType(data, defaultTypeof);
    const description = buildDescription(dataClientTypeName, data, options);
    return toSejr(dataClientTypeName, description);
}

/**
 * Takes a client-type and a compatible description and returns a sejr object
 * that will realize into the described value of the assumed type.
 *
 * Does not modify any of its parameters.
 */
 function toSejr(dataClientTypeName, untaggedDescription) {
    let result;
    let descriptionJsType = typeof untaggedDescription;
    switch (descriptionJsType) {
        case 'boolean':
        case 'number':
        case 'string': {
            if (descriptionJsType === dataClientTypeName) {
                result = untaggedDescription;
            }
            else {
                result = metaNode(dataClientTypeName, untaggedDescription);
            }
            break;
        }
        case 'undefined':
        case 'object': {
            if (dataClientTypeName === 'object') {
                if (untaggedDescription === null) {
                    result = null;
                }
                else {
                    let descriptionKeys = Object.keys(untaggedDescription);
                    if (descriptionKeys.length === 1
                            && descriptionKeys[0] === '@m') {
                        result = metaNode(undefined, untaggedDescription);
                    }
                    else {
                        result = untaggedDescription;
                    }
                }
            }
            else if (dataClientTypeName === 'array') {
                result = untaggedDescription;
            }
            else {
                result = metaNode(dataClientTypeName, untaggedDescription);
            }
            break;
        }
        default: {
            throw new Error(`Description must be a JSON-representable value, ` +
                    `but got value "${untaggedDescription}" of type `+
                    `"${descriptionJsType}".`);
        }
    }
    
    return result;
}

/**
 * Assumes that `data` is of client-type `dataClientTypeName` and builds a
 * corresponding description (i.e., the `d` part of a hypothetical meta-node).
 *
 * Does not modify any of its parameters.
 */
function buildDescription(dataClientTypeName, data, options) {
    const dataClientTypeDef = getTypeDef(options, dataClientTypeName);
    let description = dataClientTypeDef.describe(data);

    if (typeof description !== 'undefined') {
        description = describeProvidedDescription(description, options);
    }
    
    return description;
}

function describeProvidedDescription(description, options) {
    const descriptionClientType =
            options.clientType(description, defaultTypeof);
    switch (descriptionClientType) {
        case 'boolean':
        case 'number':
        case 'string': {
            if (typeof description !== descriptionClientType) {
                throw new Error(`Custom typer reported type ` +
                        `"${descriptionClientType}", but value ` +
                        `"${description}" has type ` +
                        `"${typeof description}".`);
            }
            break;
        }
        case 'object': {
            if (description !== null) {
                if (typeof description !== 'object') {
                    throw new Error(`Custom typer reported type ` +
                            `"object", but value "${description}" has ` +
                            `type "${typeof description}".`);
                }
            
                const copy = {};
                Object.keys(description).forEach(k => {
                    copy[k] = describe(description[k], options);
                });
                description = copy;
            }
            break;
        }
        case 'array': {
            if (!Array.isArray(description)) {
                throw new Error(`Custom typer reported type "array", but ` +
                        `Array.isArray() does not accept value ` +
                        `"${description}" of type ` +
                        `"${typeof description}".`);
            }
        
            const copy = new Array(description.length);
            for (let i = 0; i < description.length; i++) {
                copy[i] = describe(description[i], options);
            }
            description = copy;
            break;
        }
        default: {
            description = describe(description, options);
            break;
        }
    }
    
    return description;
}

/**
 * Maps a sejr object to a client object.
 *
 * Does not modify its parameters.
 */
function realize(sejrObject, options) {
    let clientTypeName;
    let description;

    if (isMetaNode(sejrObject)) {
        // Meta-nodes explicitly indicate their client type.
    
        const internals = sejrObject['@m'];
        clientTypeName = internals.t || 'object';
        description = internals.d;
    }
    else {
        // Non-meta-nodes have an implied client type based on their structure
        // and javascript type.
    
        description = sejrObject;
        if (Array.isArray(sejrObject)) {
            clientTypeName = 'array';
        }
        else {
            clientTypeName = typeof sejrObject;
        }
    }
    
    return realizeDescription(clientTypeName, description, options);
}

/**
 * Interprets the given `description` as the description of a value of
 * client-type `typeName`, returning the result.
 *
 * Does not modify its parameters.
 */
function realizeDescription(typeName, description, options) {
    let result;
    
    if (isBuiltInClientType(typeName)) {
        // Built-in client types provide a base case by interpretting at least
        // one level of the description's structure.
        result = realizeBuiltInClientTypeDescription(
                typeName, description, options);
    }
    else {
        // Custom client types fully defer to their type definitions to
        // understand their descriptions.
        result = realizeCustomClientTypeDescription(
                typeName, description, options);
    }
    
    return result;
}

/**
 * Interprets the given `description` as the description of a value of
 * custom client-type `typeName`, returning the result.
 *
 * Does not modify its parameters.
 */
function realizeCustomClientTypeDescription(typeName, description, options) {
    let result;

    const realizers = getTypeDef(options, typeName).realize;

    const descriptionJsType = typeof description;
    switch (descriptionJsType) {
        case 'boolean': {
            result = realizers.fromBoolean(description);
            break;
        }
        case 'number': {
            result = realizers.fromNumber(description);
            break;
        }
        case 'string': {
            result = realizers.fromString(description);
            break;
        }
        case 'undefined': {
            result = realizers.fromUndefined();
            break;
        }
        case 'object': {
            let realizedDescription = realize(description, options);
        
            if (realizedDescription === null) {
                result = realizers.fromNull(null);
            }
            else if (Array.isArray(realizedDescription)) {
                result = realizers.fromArray(realizedDescription);
            }
            else {
                result = realizers.fromObject(realizedDescription);
            }
            break;
        }
        default: {
            throw new Error(`Description nested in meta node must be ` +
                    `absent or a JSON-compatible type, but found value ` +
                    `"${description}" of type "${descriptionJsType}".`);
        }
    }
    
    return result;
}

/**
 * Interprets the given `description` as the description of a value of
 * built-in client-type `typeName`, returning the result.
 *
 * Does not modify its parameters.
 */
function realizeBuiltInClientTypeDescription(typeName, description, options) {
    let result;
    
    switch (typeName) {
        case 'boolean':
        case 'number':
        case 'string': {
            if (typeof description !== typeName) {
                throw new Error('Shouldn\'t be possible.');
            }
            
            result = description;
            break;
        }
        case 'array': {
            if (!Array.isArray(description)) {
                throw new Error('Shouldn\'t be possible.');
            }
        
            result = new Array(description.length);
            for (let i = 0; i < description.length; i++) {
                result[i] = realize(description[i], options);
            }
            
            break;
        }
        case 'object': {
            if (typeof description !== 'object') {
                throw new Error('Shouldn\'t be possible.');
            }
        
            if (description === null) {
                result = null;
            }
            else {
                result = {};
                Object.keys(description).forEach(key => {
                    result[key] = realize(description[key], options);
                });
            }
            
            break;
        }
        default: {
            throw new Error('Not a built in client type: ' + typeName);
        }
    }
    
    return result;
}

function getTypeDef(options, typeName) {
    const result = options.typeDefinitions[typeName];
    
    if (!result) {
        throw new Error(`No type definition provided for type: ${typeName}.`);
    }
    
    return result;
}

function metaNode(type, description) {
    let internal = {};
    if (typeof type !== 'undefined') {
        internal.t = type;
    }
    
    if (typeof description !== 'undefined') {
        internal.d = description;
    }
    
    return { '@m': internal };
}

function isMetaNode(n) {
    return n !== null && typeof n === 'object' && Object.keys(n).length === 1 &&
        typeof n['@m'] !== 'undefined';
}

function isBuiltInClientType(name) {
    return !!builtInClientTypes[name];
}
