/**
 * Terminal and display utility functions
 * Functions for formatting and displaying text in the terminal
 */

export const get_terminal_width = () => {
    return process.stdout.columns || 80
}

export const seperator = (width: number) => "-".repeat(width)

export const new_line = () => "\n"

// Calculate visual width of text (full-width chars = 2, half-width = 1)
const get_visual_width = (text: string): number => {
    let width = 0;
    for (const char of text) {
        // Full-width characters (CJK, emoji, etc.) take 2 columns
        // Half-width characters (ASCII, etc.) take 1 column
        const code = char.charCodeAt(0);
        if (
            (code >= 0x1100 && code <= 0x115F) || // Hangul Jamo
            (code >= 0x2E80 && code <= 0x2EFF) || // CJK Radicals
            (code >= 0x2F00 && code <= 0x2FDF) || // Kangxi Radicals
            (code >= 0x3000 && code <= 0x303F) || // CJK Symbols and Punctuation
            (code >= 0x3040 && code <= 0x309F) || // Hiragana
            (code >= 0x30A0 && code <= 0x30FF) || // Katakana
            (code >= 0x3100 && code <= 0x312F) || // Bopomofo
            (code >= 0x3130 && code <= 0x318F) || // Hangul Compatibility Jamo
            (code >= 0x3200 && code <= 0x32FF) || // Enclosed CJK Letters and Months
            (code >= 0x3300 && code <= 0x33FF) || // CJK Compatibility
            (code >= 0x3400 && code <= 0x4DBF) || // CJK Unified Ideographs Extension A
            (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified Ideographs
            (code >= 0xA000 && code <= 0xA48F) || // Yi Syllables
            (code >= 0xA490 && code <= 0xA4CF) || // Yi Radicals
            (code >= 0xAC00 && code <= 0xD7AF) || // Hangul Syllables
            (code >= 0xF900 && code <= 0xFAFF) || // CJK Compatibility Ideographs
            (code >= 0xFE30 && code <= 0xFE4F) || // CJK Compatibility Forms
            (code >= 0xFF00 && code <= 0xFFEF) || // Halfwidth and Fullwidth Forms
            (code >= 0x1F300 && code <= 0x1F9FF) // Emoji
        ) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
};

export const center_text = (text: string, width: number) => {
    const visualWidth = get_visual_width(text);
    // Ensure width is at least as large as visualWidth to avoid negative padding
    const actualWidth = Math.max(width, visualWidth);
    const leftPadding = Math.max(0, Math.floor((actualWidth - visualWidth) / 2));
    const rightPadding = Math.max(0, actualWidth - visualWidth - leftPadding);
    return " ".repeat(leftPadding) + text + " ".repeat(rightPadding);
}

export const log_array = (array: any[]) => {
    array.forEach(item => {
        console.log(item)
    })
}

export const pretentious_welcoming_message = () => {
    log_array([
        seperator(get_terminal_width()),
        new_line(),
        new_line(),
        center_text("どこにでもいるということは、 どこにもいないということだ。", get_terminal_width()),
        center_text("神の果実は私たちの中にある。", get_terminal_width()),
        center_text("存在の終わりは、 存在の始まりにすでに書かれている。", get_terminal_width()),
        new_line(),
        new_line(),
        seperator(get_terminal_width())
    ])
}




