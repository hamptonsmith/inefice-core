'use strict';

module.exports = class {
    constructor() {
        this.failuresAndErrors = [];
        this.failureCt = 0;
        this.errorCt = 0;
        this.runCt = 0;
        this.skipCt = 0;
    }

    finalize() {
        this.failuresAndErrors.forEach(e => {
            const failure = e.code === 'ERR_ASSERTION';
            const verb = failure ? 'failed' : 'caused an error';
            
            console.log(`Test case "${e.sourceTest}" ${verb}:`);
            
            if (failure) {
                console.log(e.message);
                if (typeof e.expected !== 'undefined') {
                    console.log('Expected:');
                    console.log(e.expected);
                }
                if (typeof e.actual !== 'undefined') {
                    console.log('Actual:');
                    console.log(e.actual);
                }
            }
            else {
                let first = true;
                
                while (e) {
                    if (!first) {
                        console.log('\nCaused by:');
                    }
                
                    console.log(e);
                    
                    if (e === e.cause) {
                        e = null;
                    }
                    else {
                        e = e.cause;
                    }
                    first = false;
                }
            }
        });
        
        let skipMsg = '';
        if (this.skipCt > 0) {
            skipMsg += ` (Skipped ${this.skipCt} test(s).)`;
        }
        
        let result;
        if (this.errorCt === 0 && this.failureCt === 0) {
            console.log(`All ${this.runCt} test(s) passed.${skipMsg}`);
            result = true;
        }
        else {
            console.log(`\nFailures: ${this.failureCt}, Errors: ` +
                    `${this.errorCt}.${skipMsg}`);
            result = false;
        }
        
        return result;
    }

    async runTests(testConfig) {
        for (let i = 0; i < testConfig.cases.length; i++) {
            const test = testConfig.cases[i];
            
            let skipped = false;
            let skip = () => { skipped = true; };
            
            try {
                const output = await testConfig.runner(test, skip);
                
                if (skipped) {
                    this.skipCt++;
                }
                else {
                    this.runCt++;
                    await testConfig.onReturn(test, output);
                }
            }
            catch (e) {
                this.runCt++;
                e.sourceTest = test.name;
                
                if (!skipped) {
                    if (e.code === 'ERR_ASSERTION') {
                        this.failuresAndErrors.push(e);
                        this.failureCt++;
                    }
                    else {
                        try {
                            await testConfig.onError(test, e);
                        }
                        catch (ee) {
                            ee.sourceTest = test.name;
                            ee.cause = e;
                            
                            this.failuresAndErrors.push(ee);
                            if (ee.code === 'ERR_ASSERTION') {
                                this.failureCt++;
                            }
                            else {
                                this.errorCt++;
                            }
                        }
                    }
                }
            }
        }
    }
};
