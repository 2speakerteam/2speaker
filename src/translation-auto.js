const PARTNER_KEY = '2speaker:translation-partner:v1';
let partner = '';
try { partner = sessionStorage.getItem(PARTNER_KEY) || ''; } catch { /* Session memory remains available. */ }

export const translationPartner = () => partner;
export function rememberTranslationPartner(result) {
  const source = result.sourceLanguage || '';
  if (source && !/^ko(?:-|$)/i.test(source)) {
    partner = source;
    try { sessionStorage.setItem(PARTNER_KEY, partner); } catch { /* Keep this conversation usable. */ }
  }
}

export function translationRecordingType() {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus']
    .find(type => window.MediaRecorder?.isTypeSupported(type)) || '';
}

export function translationSpeechLocale(language) {
  const base = String(language || 'ko').toLowerCase().split('-')[0];
  return ({ ko: 'ko-KR', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT',
    ja: 'ja-JP', zh: /tw|hant/i.test(language) ? 'zh-TW' : 'zh-CN', pt: 'pt-BR', ru: 'ru-RU',
    vi: 'vi-VN', th: 'th-TH', id: 'id-ID', hi: 'hi-IN', ar: 'ar-EG', nl: 'nl-NL',
    pl: 'pl-PL', tr: 'tr-TR', uk: 'uk-UA', ro: 'ro-RO', bn: 'bn-BD', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN' })[base] || language;
}

export function createTranslationSpeech(onError) {
  const audio = new Audio();
  let pending = null;
  let generation = 0;
  let utterance = null;
  const stop = () => {
    generation++;
    pending?.abort(); pending = null;
    audio.onended = audio.onerror = null;
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (utterance) window.speechSynthesis?.cancel();
    utterance = null;
  };
  const play = async (text, language) => {
    stop();
    const run = generation;
    const fallback = () => {
      if (run !== generation) return;
      audio.onerror = null;
      audio.pause();
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { onError(); return; }
      utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = translationSpeechLocale(language);
      utterance.onerror = () => { if (run === generation) onError(); };
      window.speechSynthesis.speak(utterance);
    };
    pending = new AbortController();
    try {
      const response = await fetch('/api/assistant/reply', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task: 'roadview-speech', message: text, language }), signal: pending.signal
      });
      const result = await response.json();
      if (run !== generation) return;
      if (!response.ok || !result.audioContent) throw new Error('translation speech unavailable');
      audio.src = `data:audio/mpeg;base64,${result.audioContent}`;
      audio.onerror = fallback;
      await audio.play();
    } catch (error) {
      if (run === generation && error.name !== 'AbortError') fallback();
    }
  };
  return { play, stop };
}
