/**
 * Offline follow-up ideas, used only when the AI suggestion service returns nothing
 * (rate limits, no free model available, daily cap reached). Pure logic, no dependencies.
 */
const ROMAN_URDU_HINTS = /\b(kya|kaise|kaisay|kyun|kyon|hai|hain|ho|hota|hoti|mujhe|mujhay|mein|main|btao|batao|bata|samjha|samjhao|karo|kro|kr|aur|ya|nahi|nahin|isko|iska|yeh|ye|wo|woh|koi|abhi|thora|zara|please)\b/i;

export function fallbackSuggestions(userText: string): string[] {
  if (/[\u0600-\u06FF]/.test(userText)) {
    return ['اسے آسان الفاظ میں سمجھائیں', 'اس کی ایک مثال دیں', 'اس موضوع پر مجھ سے سوال پوچھیں'];
  }
  if (ROMAN_URDU_HINTS.test(userText)) {
    return ['Isay aasan alfaaz mein samjhao', 'Iski ek example do', 'Is topic par mujh se sawaal poochho'];
  }
  return ['Explain this in simpler words', 'Give me a practical example', 'Ask me a practice question on this'];
}
