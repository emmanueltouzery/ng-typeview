import * as assert from 'assert'
import {execSync} from 'child_process';
import {readFileSync} from "fs";
import {processProject} from "../src/ng-typeview"
import {NgFilter, defaultNgFilters} from "../src/filters"
import {defaultCtrlViewConnectors, defaultModelViewConnectors,
        CtrlViewFragmentExtractor} from "../src/controller-parser"
import {defaultTagDirectiveHandlers, defaultAttrDirectiveHandlers} from "../src/ng-directives"
import * as ts from "typescript";

const filters = defaultNgFilters.concat([
    new NgFilter("formatNumber", "(input: string, formatType: 'hex'|'dec') => string")]);

const checkViewFragmentExtractor: CtrlViewFragmentExtractor = {
    interceptAstNode: ts.SyntaxKind.CallExpression,
    getViewFragments: _node => {
        const node = <ts.CallExpression>_node;
        if (node.expression.getText().endsWith(".checkViewFragment")) {
            if (node.arguments.length === 1 &&
                [ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.StringLiteral]
                .indexOf(node.arguments[0].kind) >= 0) {
                return [(<ts.StringLiteral>node.arguments[0]).text];
            } else {
                console.warn("Warning: ignoring non-conformant checkViewFragment call." + node.getText());
            }
        }
        return [];
    }
};

describe("processProject", () => {
    it("should generate view test files", async () => {
        execSync("git clean -xf test/data");
        await processProject({
            path: "test/data",
            blacklistedPaths: [],
            ngFilters: filters,
            ctrlViewConnectors: defaultCtrlViewConnectors,
            modelViewConnectors: defaultModelViewConnectors,
            extraCtrlViewConnections: [],
            tagDirectives: defaultTagDirectiveHandlers,
            attributeDirectives: defaultAttrDirectiveHandlers,
            ctrlViewFragmentExtractors: [checkViewFragmentExtractor]});
        const actualContents = readFileSync("test/data/test-ctrl_test-view_viewtest.ts").toString();
        const expectedContents = readFileSync("test/data/expected_testview.ts").toString();
        assert.equal(expectedContents, actualContents);

        const actualContentsDirective = readFileSync("test/data/test-directive_directive-template_viewtest.ts").toString();
        const expectedContentsDirective = readFileSync("test/data/expected_directive_testview.ts").toString();
        assert.equal(expectedContentsDirective, actualContentsDirective);

        const actualContentsDirective2 = readFileSync("test/data/test-directive2_directive-template_viewtest.ts").toString();
        const expectedContentsDirective2 = readFileSync("test/data/expected_directive2_testview.ts").toString();
        assert.equal(expectedContentsDirective2, actualContentsDirective2);

        const actualContentsDirective3 = readFileSync("test/data/test-directive3_directive-template_viewtest.ts").toString();
        const expectedContentsDirective3 = readFileSync("test/data/expected_directive3_testview.ts").toString();
        assert.equal(expectedContentsDirective3, actualContentsDirective3);

        const actualContentsDirective4 = readFileSync("test/data/test-directive4_directive-template_viewtest.ts").toString();
        const expectedContentsDirective4 = readFileSync("test/data/expected_directive4_testview.ts").toString();
        assert.equal(expectedContentsDirective4, actualContentsDirective4);
    });
});
