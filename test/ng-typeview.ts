import * as assert from 'assert'
import {execSync} from 'child_process';
import {readFileSync} from "fs";
import {processProjectFolder} from "../src/ng-typeview"

describe("processProjectFolder", () => {
    it("should generate view test files", async () => {
        execSync("git clean -xf test/data");
        await processProjectFolder("test/data", []);
        const actualContents = readFileSync("test/data/test-ctrl_viewtest.ts").toString();
        const expectedContents = readFileSync("test/data/expected_testview.ts").toString();
        assert.equal(expectedContents, actualContents);
    });
});
