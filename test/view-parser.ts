import * as assert from 'assert'
import {parseView, ParsedExpression, ParsedVariable, LoopStart, LoopEnd} from "../src/view-parser"

describe("parseView", () => {
    it("should find angular attributes", async () => {
        const viewInfos = await parseView("test/data/test-view.html");
        assert.equal(10, viewInfos.length);
        assert.equal("data.showText['five'].function() === 6", (<ParsedVariable>viewInfos[0]).expr);
        assert.equal("boolean", (<ParsedVariable>viewInfos[0]).type);
        assert.equal("!user.wantsData()", (<ParsedVariable>viewInfos[1]).expr);
        assert.equal("boolean", (<ParsedVariable>viewInfos[1]).type);
        assert.equal("showDiv", (<ParsedVariable>viewInfos[2]).expr);
        assert.equal("boolean", (<ParsedVariable>viewInfos[2]).type);
        assert.equal("triggerAction('six')", (<ParsedVariable>viewInfos[3]).expr);
        assert.equal("any", (<ParsedVariable>viewInfos[3]).type);
        assert.equal("data.firstname", (<ParsedVariable>viewInfos[4]).expr);
        assert.equal("any", (<ParsedVariable>viewInfos[4]).type);
        assert.equal("group in data.groups", (<LoopStart>viewInfos[5]).loopExpr);
        assert.equal("item in group", (<LoopStart>viewInfos[6]).loopExpr);
        assert.equal("item.name + ' ' + user.wantsData()", (<ParsedVariable>viewInfos[7]).expr);
        assert.equal("any", (<ParsedVariable>viewInfos[7]).type);
        assert.ok(viewInfos[8] instanceof LoopEnd);
        assert.ok(viewInfos[9] instanceof LoopEnd);
    });
});
