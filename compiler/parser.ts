import { Parser, charCode, oneOf, skipMany1,  seq, char, many, noneOf, parse, State, choice, letter, string,  digit, fmap, many1, sepBy } from "parse-combinator"
import { LainType } from "./lain_element"
import type { LainElement } from "./lain_element"

const lainStr = (val: string): LainElement => ({ type: LainType.string, value: val });
const lainNumber = (val: number): LainElement => ({ type: LainType.number, value: val });
const lainBoolean = (val: boolean): LainElement => ({ type: LainType.boolean, value: val });
const lainSymbol = (val: string): LainElement => ({ type: LainType.symbol, value: val });

const symbol = oneOf("!#$%&|*+-/:<=>?@^_~\"")
const space = oneOf("\t\r\n ")
const spaces = skipMany1(space)

const parseString = seq(m =>{
    m(char('"'));
    const x = m(many(
        noneOf("\"")
    ));
    m(char('"'));
    return x == undefined ? x : lainStr(x.join(""))
})

const parseBoolean = seq(m => {
    const first = m(char("#"));
    const rest = m(choice([
        char("t"),
        char("f"),
    ]))
    return rest === "t" ? lainBoolean(true) : lainBoolean(false)
})

const parseAtom = seq(m =>{
   const all = m(many1(choice([
    letter,
    symbol,
    digit
   ])))
   return all == undefined ? all : lainSymbol(all.join(""))
})

// Helper type for nested arrays (lists are arrays, not wrapped LainElement)
type LainExpr = LainElement | LainExpr[]

const parseNumber : Parser<LainElement> = fmap(x => lainNumber(Number(x.join(""))), many1(digit))

const parseQuoted : Parser<LainExpr[]> = seq(m => {
    m(char("'"));
    const x = m(parseExpr);
    // Normalize: if x is an array (list), flatten it; if it's a single element, use it directly
    if (Array.isArray(x)) {
        return [lainSymbol("quote"), ...x]
    } else {
        return [lainSymbol("quote"), x]
    }
})

const parseList : Parser<LainExpr[]> = seq(m => {
    m(char("("));
    const x = m(sepBy(parseExpr, spaces));
    m(char(")"));
    // Return as-is: arrays remain arrays, single elements remain elements
    return x
})


export const parseExpr: Parser<LainExpr> = choice([
    parseNumber,
    parseBoolean,
    parseString,
    parseAtom,
    parseQuoted as Parser<LainExpr>,
    parseList as Parser<LainExpr>
])
