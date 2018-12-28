'use strict';

const assert = require('assert');

module.exports = (extension) => {
    extension = extension || {};
    
    extension.onReturn = (test, output) => {
        if (test.errorMessageContains) {
            throw new assert.AssertionError({
                operator: 'errorMessageContains',
                message: `Expected error.`,
                expected: test.errorMessageContains,
                actual: output,
            });
        }
    
        assert.deepEqual(output, test.output, 'Incorrect output.');
    };
    
    extension.onError = (test, e) => {
        if (!test.errorMessageContains) {
            e.message = `Error in test ${test.name}: ${e.message}`;
            
            throw e;
        }
        
        if (!e.message.includes(test.errorMessageContains)) {
            throw new assert.AssertionError({
                operator: 'errorMessageContains',
                message: `Unexpected error message.`,
                expected: test.errorMessageContains,
                actual: e.message,
            });
        }
    };
    
    return extension;
};
