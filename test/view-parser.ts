import * as assert from 'assert'
import {parseView, ParsedExpression, ParsedVariable,
        LoopStart, LoopEnd, FilterExpression} from "../src/view-parser"

describe("parseView", () => {
    it("should find angular attributes", async () => {
        const viewInfos = await parseView("test/data/test-view.html");
        assert.equal(14, viewInfos.length);
        assert.equal("data.showText['five'].function() === 6", (<ParsedVariable>viewInfos[0]).expr);
        assert.equal("boolean", (<ParsedVariable>viewInfos[0]).type);
        assert.equal("!user.wantsData()", (<ParsedVariable>viewInfos[1]).expr);
        assert.equal("boolean", (<ParsedVariable>viewInfos[1]).type);
        assert.equal("showDiv", (<ParsedVariable>viewInfos[2]).expr);
        assert.equal("boolean", (<ParsedVariable>viewInfos[2]).type);
        assert.equal("triggerAction('six')", (<ParsedVariable>viewInfos[3]).expr);
        assert.equal("any", (<ParsedVariable>viewInfos[3]).type);
        assert.equal("translate", (<FilterExpression>viewInfos[4]).filterName);
        assert.equal("'CLICK_ME'", (<FilterExpression>viewInfos[4]).filterInput);
        assert.deepEqual([], (<FilterExpression>viewInfos[4]).filterParams);
        assert.equal("data.firstname", (<ParsedVariable>viewInfos[5]).expr);
        assert.equal("any", (<ParsedVariable>viewInfos[5]).type);
        assert.equal("maxlength", (<ParsedVariable>viewInfos[6]).expr);
        assert.equal("any", (<ParsedVariable>viewInfos[6]).type);
        assert.equal("group in data.groups", (<LoopStart>viewInfos[7]).loopExpr);
        assert.equal("item in group", (<LoopStart>viewInfos[8]).loopExpr);
        assert.equal("item.name + ' ' + user.wantsData()", (<ParsedVariable>viewInfos[9]).expr);
        assert.equal("any", (<ParsedVariable>viewInfos[9]).type);
        assert.equal("triggerAction('five')", (<ParsedVariable>viewInfos[10]).expr);
        assert.equal("any", (<ParsedVariable>viewInfos[10]).type);
        assert.ok(viewInfos[11] instanceof LoopEnd);
        assert.equal("maxlength", (<FilterExpression>viewInfos[12]).filterInput);
        assert.equal("formatNumber", (<FilterExpression>viewInfos[12]).filterName);
        assert.deepEqual(["'hex'"], (<FilterExpression>viewInfos[12]).filterParams);
        assert.ok(viewInfos[13] instanceof LoopEnd);
    });
});
