import * as assert from 'assert'
import {execSync} from 'child_process';
import {readFileSync} from "fs";
import {processProject, NgFilter, defaultNgFilters} from "../src/ng-typeview"
import {defaultCtrlViewConnectors} from "../src/controller-parser"
import {defaultTagDirectiveHandlers, defaultAttrDirectiveHandlers} from "../src/ng-directives"

const filters = defaultNgFilters.concat([
    new NgFilter("formatNumber", "(input: string, formatType: 'hex'|'dec') => string")]);

describe("processProject", () => {
    it("should generate view test files", async () => {
        execSync("git clean -xf test/data");
        await processProject({
            path: "test/data",
            blacklistedPaths: [],
            ngFilters :filters,
            ctrlViewConnectors: defaultCtrlViewConnectors,
            tagDirectives: defaultTagDirectiveHandlers,
            attributeDirectives: defaultAttrDirectiveHandlers});
        const actualContents = readFileSync("test/data/test-ctrl_test-view_viewtest.ts").toString();
        const expectedContents = readFileSync("test/data/expected_testview.ts").toString();
        assert.equal(expectedContents, actualContents);
    });
});
