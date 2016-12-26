import * as assert from 'assert'
import {execSync} from 'child_process';
import {readFileSync} from "fs";
import {processProjectFolder, NgFilter, basicFilters} from "../src/ng-typeview"

export const filters = basicFilters.concat([
    new NgFilter("formatNumber", "(input: string, formatType: 'hex'|'dec') => string")]);

describe("processProjectFolder", () => {
    it("should generate view test files", async () => {
        execSync("git clean -xf test/data");
        await processProjectFolder({
            path: "test/data",
            blacklist: [],
            ngFilters :filters,
            ctrlViewConnectors: []});
        const actualContents = readFileSync("test/data/test-ctrl_test-view_viewtest.ts").toString();
        const expectedContents = readFileSync("test/data/expected_testview.ts").toString();
        assert.equal(expectedContents, actualContents);
    });
});
