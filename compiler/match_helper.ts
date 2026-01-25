import { get_value } from "pmatcher/MatchDict/DictInterface";
import { MatchResult } from "pmatcher/MatchResult/MatchResult";



export const matched_lookup = (result: MatchResult, key: string) => {
    return get_value(key, result.dictionary)
}