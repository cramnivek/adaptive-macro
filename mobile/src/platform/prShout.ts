/**
 * Strips emoji characters, punctuation noise, and formatting so Web Speech synthesis
 * can speak Ronnie Coleman quotes cleanly, naturally, and punchily.
 */
export const cleanForSpeech = (rawText: string): string => {
  return rawText
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[⚡🔥💀🗣️⭐*·]/g, '')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Speaks Ronnie Coleman's legendary hype quotes ("Yeah buddy! Light weight baby!")
 * via Web Speech API when running in a supported browser.
 */
export const shoutColemanPR = (quote?: string, soundEnabled = true): void => {
  if (!soundEnabled) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    const raw = quote || 'YEAH BUDDY! LIGHT WEIGHT BABY!';
    const cleaned = cleanForSpeech(raw) || 'Yeah buddy! Light weight baby!';
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.rate = 1.05;
    utterance.pitch = 1.15;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const englishVoice =
        voices.find(
          (v) => v.lang.startsWith('en-US') && !v.name.toLowerCase().includes('whisper'),
        ) || voices.find((v) => v.lang.startsWith('en'));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech synthesis quietly fails if unsupported/blocked
  }
};
