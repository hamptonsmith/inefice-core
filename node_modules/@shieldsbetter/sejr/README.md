The Shieldsbetter extensible JSON representation (`sejr`) provides a disciplined
way to represent non-JSON-compatible values in JSON while maintaining the
readability and compactness of JSON.  `sejr` objects serialize to 100% vanilla
JSON.

The short version is that we define an _escape structure_ that indicates that a
portion of the JSON structure should be interpretted specially.  This escape
structure is an object with a single key, `@m`, whose value is an object that
specifies `d`, a JSON description of the value, and `t`, a named type that
indicates a pre-arranged interpretation of the provided description.

All other data is encoded as normal JSON, meaning that we only add complexity
to the representation where it is necessary.

So, for example, if you are encoded some mostly-JSON game state, containing a
few non-JSON `SpaceShip` objects into JSON, the result may look like this:

```json
{
    "turnNumber": 5,
    "seed": "5e0c85a92c3625fa84328a0290842071cc62e161",
    "ships": [
        { "@m": { "t": "SpaceShip", "d": { "x": 54, "y": 93 } } },
        { "@m": { "t": "SpaceShip", "d": { "x": 11, "y": 17 } } }
    ]
}
```

This reference library converts back and forth between client values and `sejr`
values.

# Usage

Define custom client types:

```javascript
const Sejr = require('@shieldsbetter/sejr');
const gameStateRepresentation = new Sejr({
    clientType: (i, builtInClientTypeFn) => {
        let result;
        
        if (i instanceof SpaceShip) {
            result = 'SpaceShip';
        }
        else {
            result = builtInClientTypeFn(i);
        }
        
        return result;
    },
    typeDefinitions: {
        SpaceShip: {
            describe: s => { x: s.getX(), y: s.getY() },
            realize: {
                fromObject: o => new SpaceShip(o.x, o.y)
            }
        }
    }
});
```

Convert from a client object to a `sejr` object:

```javascript
send(JSON.stringify(gameStateRepresentation.describe(gameState)));
```

Convert from a `sejr` object to a client object:

```javascript
updateGameState(gameStateRepresentation.realize(JSON.parse(read())));
```

# Full API

## new Sejr(<options>)

Available options are:

* `clientType` - a function from `(value, builtInClientTypeFn)` to the string
  name of the client type.
  
  The built-in client type function will return only the built-in client
  types: `array`, `boolean`, `number`, `object`, and `string`.  It is an
  error to return the client type `array` for values that are not accepted
  by `Array.isArray()`.  It is also an error to return any other built-in
  client type for values for which the native javescript `typeof` operator
  would not return the same name.  Clients should generally defer to
  `builtInClientTypeFn` to handle the built-in types.
  
  Otherwise, it is allowable to return any string as a custom type name, so
  long as a key with that name appears in the `typeDefinitions` options
  field.
      
* `typeDefinitions` - a map from custom client type names to client type
      definitions.  It is an error to include a definition for any built-in
      client type.  Each client type definition is itself a map with the
      following required entries:
    * `describe` - a function from a javascript value of the given client type
          to a description of that value.  The returned description may be
          `undefined` to indicate that no description is necessary (for 
          singleton types), or any value that itself can be described by
          `sejr.describe()`.  Take care not to introduce cyclic description
          dependencies!
    * `realize` - a map of _realization functions_ which take as their sole
          argument a description as produced by this client type's corresponding
          `describe()` function and return the described client javascript
          value.  At least one realization function must be provided:
        * `fromArray(description)` - called when the description is accepted by
              `Array.isArray()`.
        * `fromBoolean(description)` - called when `typeof description` is
              `boolean`.
        * `fromNull(description)` - called when `description === null`.
        * `fromNumber(description)` - called when `typeof description` is
              `number`.
        * `fromObject(description)` - called when `description !== null &&
              typeof description === 'object'`.
        * `fromString(description)` - called when `typeof description` is
              `string`
        * `fromUndefined(description)` - called when a description is not
              provided.

## sejr.describe(<client value>)

Converts a client value into a `sejr` value suitable for passing to `JSON.stringify()`.

## sejr.realize(<sejr value>)

Converts a `sejr` value into a client value.

# Representation Specification

`sejr` values are JSON-serializable values that represent more general
javascript values.

* `sejr` values with the terminal JSON types (`boolean`, `string`, `null`, and
  `number`) represent their corresponding javascript values.
  
  So,
  
  ```javascript
  sejr.realize(true);  // -> true
  sejr.realize(5);     // -> 5
  sejr.realize('foo'); // -> 'foo'
  sejr.realize(null);  // -> null;
  ```
  
* `sejr` arrays represent javascript arrays, with each element of the `sejr`
  array understood as a `sejr` value representing the value of the corresponding
  javascript array element.
  
  So,
  
  ```javascript
  sejr.realize([true, 5, 'foo', null]);  // -> [true, 5, 'foo', null]
  ```
  
* `sejr` objects are partitioned into _escape objects_ and _non-escape objects_.
  An escape object is any object with exactly one key, where that key is named
  `@m`.  All other objects are non-escape objects.

    * Non-escape `sejr` objects represent vanilla javascript objects whose
      keys correspond to the keys in the `sejr` object, and where each key
      maps to that value represented by the `sejr` value in the corresponding
      entry of the non-escape `sejr` object.
      
      So,
      
      ```javascript
      sejr.realize({foo: 'bar', bazz: 'plugh'});  // -> { foo: 'bar', bazz: 'plugh' }
      ```
    * Escape `sejr` objects represent javascript values interpretted from an
      optional _description_ by a pre-arranged semantic.  The `@m` key of an
      escape object must itself map to a _value specifier_ object.  If the
      value specifier object has a key `t`, it must map to a string specifying
      the client type name to be used to understand any associated
      description.  If no `t` key is specified, the client type is understood
      to be `object`.  If the value specifier has a key `d`, its corresponding
      value is the provided description to be understood according to the
      semantics of the client type.  If no `d` key is specified, no
      description has been provided.
      
      With the exception of `object`, all built-in client types are disallowed
      as the client type of an escape object (use the corresponding JSON
      structures instead.)  Escape objects with `object` client-type represent
      vanilla javascript objects whose descriptions are interpretted according
      to the non-escaped object semantics above.  Note that because this
      specifies the first level of the corresponding javascript object
      literally, this provides a way to represent javascript objects that
      would otherwise be interpretted as escape objects.  I.e., the `sejr`
      value `{"@m": {"d": {"@m": "foo"}}}` represents the literal javascript
      object `{"@m": "foo"}`.
      
      All other escape `sejr` objects represent javascript values of the
      specified client type, with descriptions that are themselves
      interpretted as `sejr` values.
      
      So,
      
      ```javascript
      sejr.realize({'@m': {t: 'foo', d: 123}});  // -> a foo value described by 123
      sejr.realize({'@m': {d: {'@m': 123}}});  // -> { "@m": 123 }
      sejr.realize({'@m': {t: 'foo', d: {'@m': {d: {'@m': 123}}}}});  // -> a foo value described by {"@m": 123}
      ```
