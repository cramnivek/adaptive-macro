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
 * Voice shout disabled to prevent robotic AI speech synthesis and avoid audio likeness concerns.
 */
export const shoutColemanPR = (_quote?: string, _soundEnabled = true): void => {
  // Intentionally disabled: no synthetic AI voice or unapproved voice audio
};
