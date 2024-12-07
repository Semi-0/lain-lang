import { Parser, charCode, oneOf, skipMany1,  seq, char, many, noneOf, parse, State, choice, letter, digit, fmap, many1, sepBy } from "parse-combinator"
import  { SchemeElement, schemeStr, schemeNumber, schemeBoolean, schemeSymbol, schemeList } from "./definition/SchemeElement"
import * as util from 'util';

const symbol = oneOf("!#$%&|*+-/:<=>?@^_~\"")
const space = oneOf("\t\r\n ")
const spaces = skipMany1(space)

const parseString = seq(m =>{
    m(char('"'));
    const x = m(many(
        noneOf("\"")
    ));
    m(char('"'));
    return x == undefined ? x : schemeStr(x.join(""))
})

const parseBoolean = seq(m => {
    const first = m(char("#"));
    const rest = m(choice([
        char("t"),
        char("f"),
    ]))
    return rest === "t" ? schemeBoolean(true) : schemeBoolean(false)
})

const parseAtom = seq(m =>{
   const all = m(many1(choice([
    letter,
    symbol,
    digit
   ])))
   return all == undefined ? all : schemeSymbol(all.join(""))
})

const parseNumber : Parser<SchemeElement> = fmap(x => schemeNumber(Number(x.join(""))), many1(digit))

const parseQuoted : Parser<SchemeElement> = seq(m => {
    m(char("'"));
    const x = m(parseExpr);
    return schemeList([schemeSymbol("quote"), x])
})

const parseList : Parser<SchemeElement> = seq(m => {
    m(char("("));
    const x = m(sepBy(parseExpr, spaces));
    m(char(")"));
    return schemeList(x)
})


export const parseExpr: Parser<SchemeElement> = choice([
    parseNumber,
    parseBoolean,
    parseString,
    parseAtom,
    parseQuoted,
    parseList
])




// const test = parse(parseExpr, new State("(lambda (x) (+ 1 2))"))
// console.log(test.toString())
// console.log(util.inspect(test, {showHidden: true, depth: 8}))