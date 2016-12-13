import * as assert from 'assert'
import {parseView, ParsedExpression} from "../src/view-parser"

describe("parseView", () => {
    it("should find angular attributes", async () => {
        const viewInfos = await parseView("test/data/test-view.html");
        assert.equal(5, viewInfos.length);
        assert.equal("data.showText['five'].function() === 6", viewInfos[0].expr);
        assert.equal("boolean", viewInfos[0].type);
        assert.equal("!user.wantsData()", viewInfos[1].expr);
        assert.equal("boolean", viewInfos[1].type);
        assert.equal("showDiv", viewInfos[2].expr);
        assert.equal("boolean", viewInfos[2].type);
        assert.equal("triggerAction('six')", viewInfos[3].expr);
        assert.equal("any", viewInfos[3].type);
        assert.equal("data.firstname", viewInfos[4].expr);
        assert.equal("any", viewInfos[4].type);
    });
});
