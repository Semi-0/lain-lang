import { Parser, charCode, oneOf, skipMany1,  seq, char, many, noneOf, parse, State, choice, letter, digit, fmap, many1, sepBy } from "parse-combinator"
import  {  LispType, as_type } from "../shared/type_layer"
import * as util from 'util';
import type { LayeredObject } from "sando-layer/Basic/LayeredObject";
import type { Layer } from "sando-layer/Basic/Layer";
import { mark_error } from "sando-layer/Specified/ErrorLayer"
import { string } from "parse-combinator"
const symbol = oneOf("!#$%&|*+-/:<=>?@^_~\"")
const space = oneOf("\t\r\n ")
const spaces = skipMany1(space)

const parseString = seq(m =>{
    m(char('"'));
    const x = m(many(
        noneOf("\"")
    ));
    m(char('"'));
    return x == undefined ? x : as_type(x, LispType.string)
})

const parseBoolean = seq(m => {
    const first = m(char("#"));
    const rest = m(choice([
        char("t"),
        char("f"),
    ]))
    return rest === "t" ? as_type(true, LispType.boolean) : as_type(false, LispType.boolean)
})

const parseCellBoolean = seq(m => {
    const first = m(char("^"));
    const rest = m(choice([
        string("contradiction"),
        string("nothing")
    ]))
    return rest === "contradiction" ? as_type("contradiction", LispType.cell_boolean) : as_type("nothing", LispType.cell_boolean)
})

const parseAtom = seq(m =>{
   const all = m(many1(choice([
    letter,
    symbol,
    digit
   ])))
   return all == undefined ? all : as_type(all.join(""), LispType.symbol)
})

const parseNumber : Parser<LayeredObject> = fmap(x => as_type(Number(x.join("")), LispType.number), many1(digit))

const parseQuoted : Parser<LayeredObject> = seq(m => {
    m(char("'"));
    const x = m(parseExpr);
    return as_type([as_type("quote", LispType.quoted), x], LispType.list)
})

const parseList : Parser<LayeredObject> = seq(m => {
    m(char("("));
    const x = m(sepBy(parseExpr, spaces));
    m(char(")"));
    return as_type(x, LispType.list)
})


export const parseExpr: Parser<LayeredObject> = choice([
    parseNumber,
    parseBoolean,
    parseCellBoolean,
    parseString,
    parseAtom,
    parseQuoted,
    parseList
])


export function parseAST(str: string){
    let result = parse(parseExpr, new State(str))
    if (result.value){
        return result.value
    } 
    else{
        return mark_error(str, Error("failed to parse"))
    }
}