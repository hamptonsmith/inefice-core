const baseTestConfig = require('./base-test-config');
const TestRunner = require('./test-runner');

async function main() {
    const testRunner = new TestRunner();
    await testRunner.runTests(baseTestConfig(require('./realize-tests')));
    await testRunner.runTests(baseTestConfig(require('./describe-tests')));
    
    const success = testRunner.finalize();
    if (!success) {
        process.exit(1);
    }
}

main().catch(e => {
    console.log(e);
    process.exit(1);
});
