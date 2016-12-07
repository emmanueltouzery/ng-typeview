/// <reference path="typings/node/node.d.ts" />
//  <reference path="typings/globals/html2parser2/index.d.ts"

// var htmlparser = require("htmlparser2");
import {Parser, Handler} from "htmlparser2";
import {readFileSync} from "fs";
import {List} from "immutable";

type ExpressionType = "boolean" | "any"

interface AttributeHandler {
    attrName: string,
    getExpressions: (val: string) => {expr: string, type: ExpressionType}[]
}

const ngShowAttributeHandler = {
    attrName: "ng-show",
    getExpressions: val => [{expr: val, type: "boolean"}]
};

const ngClickAttributeHandler = {
    attrName: "ng-click",
    getExpressions: val => [{expr: val, type: "any"}]
}

const attributeHandlers = List.of(
    ngShowAttributeHandler, ngClickAttributeHandler);

function writeExpression(expr: ExpressionType): void {
    console.log(expr);
}

const myHandler: Handler = {
    // onopentag: (name: string, attribs:{[type:string]: string}) => {
    //     console.log("tag open " + name);
    // },
    onattribute: (name: string, value: string) => {
        const exprs = attributeHandlers
            .filter(attrHandler => attrHandler.attrName === name)
            .flatMap(handler => handler.getExpressions(value));
        exprs.forEach(writeExpression);
    }
};

const parser = new Parser(myHandler);

const fileNames = process.argv.slice(2);
fileNames.forEach(fileName => {
    parser.write(readFileSync(fileName).toString());
});
