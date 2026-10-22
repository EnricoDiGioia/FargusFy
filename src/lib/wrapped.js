// Contas e textos da Retrospectiva (sem React, para ficar fácil de testar)

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad = (n) => String(n).padStart(2, '0');

// período: "2026" (ano) ou "2026-10" (mês)
export function parsePeriod(p, now = new Date()) {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(p || '');
  const year = m ? Number(m[1]) : now.getFullYear();
  const month = m && m[2] ? Number(m[2]) : null;
  if (month && month >= 1 && month <= 12) {
    const next = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
    return { key: `${year}-${pad(month)}`, year, month, from: `${year}-${pad(month)}-01`, to: next, label: `${MONTHS[month - 1]} de ${year}`, short: MONTHS[month - 1] };
  }
  return { key: String(year), year, month: null, from: `${year}-01-01`, to: `${year + 1}-01-01`, label: String(year), short: String(year) };
}

export const monthName = (i) => MONTHS[i];

export function fmtDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` de ${y}` : ''}`;
}

export const minutes = (ms) => Math.round((ms || 0) / 60000);
export const fmtInt = (n) => Math.round(n).toLocaleString('pt-BR');

export function fmtHours(ms) {
  const min = minutes(ms);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

// faixa do dia em que mais ouviu
const SHIFTS = [
  { key: 'madrugada', from: 0, to: 6, title: 'Coruja da madrugada', text: 'A maior parte das músicas tocou entre meia-noite e as 6 da manhã.' },
  { key: 'manha', from: 6, to: 12, title: 'Trilha do amanhecer', text: 'A maior parte das músicas tocou de manhã, antes do meio-dia.' },
  { key: 'tarde', from: 12, to: 18, title: 'Som da tarde', text: 'A maior parte das músicas tocou à tarde, entre o meio-dia e as 6.' },
  { key: 'noite', from: 18, to: 24, title: 'Alma noturna', text: 'A maior parte das músicas tocou à noite, depois das 6 da tarde.' },
];

export function shiftOf(hours) {
  const byHour = new Array(24).fill(0);
  for (const h of hours || []) if (h.hour >= 0 && h.hour < 24) byHour[h.hour] = Number(h.ms) || 0;
  const total = byHour.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const sums = SHIFTS.map((s) => byHour.slice(s.from, s.to).reduce((a, b) => a + b, 0));
  const best = sums.indexOf(Math.max(...sums));
  const peak = byHour.indexOf(Math.max(...byHour));
  return { ...SHIFTS[best], share: sums[best] / total, byHour, peak };
}

// tipo de ouvinte, escolhido pelos números
export function listenerType(w) {
  const total = Number(w.total_ms) || 0;
  const top5 = (w.top_artists || []).slice(0, 5).reduce((a, x) => a + Number(x.ms), 0);
  const topTrack = w.top_tracks?.[0];
  if (topTrack && w.plays >= 10 && topTrack.plays / w.plays >= 0.2)
    return {
      key: 'repeat',
      title: 'No repeat',
      text: `"${topTrack.title}" foi ${Math.round((topTrack.plays / w.plays) * 100)}% de todas as reproduções.`,
    };
  if (w.artist_count >= 12 && total && top5 / total < 0.6)
    return { key: 'explorer', title: 'Explorador de sons', text: `${fmtInt(w.artist_count)} artistas diferentes, e nenhum dominou a lista.` };
  if (total && top5 / total >= 0.6)
    return { key: 'loyal', title: 'Fiel ao repertório', text: `${Math.round((top5 / total) * 100)}% do tempo foi com os mesmos 5 artistas.` };
  return { key: 'mix', title: 'Ouvido eclético', text: `${fmtInt(w.track_count)} músicas de ${fmtInt(w.artist_count)} artistas.` };
}

// comparação divertida para os minutos
export function minutesFun(w) {
  const min = minutes(w.total_ms);
  const top = w.top_tracks?.[0];
  if (top?.duration_ms > 60000 && min >= 10) {
    const times = Math.floor(w.total_ms / top.duration_ms);
    if (times >= 3) return `Dá para ouvir "${top.title}" ${fmtInt(times)} vezes seguidas.`;
  }
  if (min >= 60 * 24) return `São ${fmtInt(min / 60 / 24)} dias inteiros de música, sem parar.`;
  if (min >= 120) return `São ${fmtInt(min / 60)} horas de música.`;
  return `${fmtInt(w.plays)} ${w.plays === 1 ? 'música tocada' : 'músicas tocadas'} até agora.`;
}

export function rankText(r, subject, what) {
  if (!r || r.listeners < 2) return null;
  if (r.rank === 1) return `Ninguém em Fargus ${what} mais que ${subject === 'Você' ? 'você' : subject}.`;
  return `${r.rank}º lugar entre os ${r.listeners} personagens de Fargus.`;
}

// a lista de telas da Retrospectiva, só com as que têm dados
export function buildSlides(w) {
  const shift = shiftOf(w.hours);
  const slides = ['intro', 'minutes'];
  if (w.top_day && shift) slides.push('time');
  if (w.top_artists?.length) slides.push('artist');
  if (w.top_artists?.length >= 3) slides.push('artists');
  if (w.top_tracks?.length) slides.push('track');
  if (w.top_tracks?.length >= 3) slides.push('tracks');
  slides.push('type', 'summary');
  return slides;
}

export const MIN_MS = 60 * 1000; // menos de 1 minuto: ainda não tem Retrospectiva
