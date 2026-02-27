'use strict';
import { play, pause, togglePlayPause, nextTrack, prevTrack, setVolume, getVolume, getMeta, getPosition, seek, isPlaying, isInitialized, getPlaylist, getCurrentIndex, playTrack } from './music.js';

let updateInterval = null;
let trackListEl = null;

export function setupRadio(containerSelector) {
  const radio = containerSelector
    ? document.querySelector(containerSelector)
    : document.getElementById('radio');
  if (!radio) return;

  const songEl = radio.querySelector('.radio-song') || document.getElementById('radio-song');
  const playBtn = radio.querySelector('.radio-play') || document.getElementById('radio-play');
  const prevBtn = radio.querySelector('.radio-prev') || document.getElementById('radio-prev');
  const nextBtn = radio.querySelector('.radio-next') || document.getElementById('radio-next');
  const listBtn = radio.querySelector('.radio-list') || document.getElementById('radio-list');
  const scrubBg = radio.querySelector('.radio-scrub-bg') || document.getElementById('radio-scrub-bg');
  const scrubFill = radio.querySelector('.radio-scrub-fill') || document.getElementById('radio-scrub-fill');
  const scrubDot = radio.querySelector('.radio-scrub-dot') || document.getElementById('radio-scrub-dot');
  const scrubArea = radio.querySelector('.radio-scrub') || document.getElementById('radio-scrub');
  const timeEl = radio.querySelector('.radio-time') || document.getElementById('radio-time');
  const volSlider = radio.querySelector('.radio-vol-slider') || document.getElementById('radio-vol-slider');

  // Initial state
  _updateDisplay(songEl, timeEl, scrubFill, scrubDot, playBtn);
  if (volSlider) volSlider.value = Math.round(getVolume() * 100);

  // Play/pause
  if (playBtn) playBtn.addEventListener('click', () => {
    if (!isInitialized()) return;
    const nowPlaying = togglePlayPause();
    playBtn.textContent = nowPlaying ? '\u23F8' : '\u25B6';
    if (nowPlaying) _updateDisplay(songEl, timeEl, scrubFill, scrubDot, playBtn);
  });

  // Prev/next
  if (prevBtn) prevBtn.addEventListener('click', async () => {
    if (!isInitialized()) return;
    const meta = await prevTrack();
    if (meta) _setSongMarquee(songEl, meta);
    if (playBtn) playBtn.textContent = isPlaying() ? '\u23F8' : '\u25B6';
  });
  if (nextBtn) nextBtn.addEventListener('click', async () => {
    if (!isInitialized()) return;
    const meta = await nextTrack();
    if (meta) _setSongMarquee(songEl, meta);
    if (playBtn) playBtn.textContent = isPlaying() ? '\u23F8' : '\u25B6';
  });

  // Track list popup
  if (listBtn) listBtn.addEventListener('click', () => {
    _toggleTrackList(radio, songEl, playBtn, timeEl, scrubFill, scrubDot);
  });

  // Volume
  if (volSlider) volSlider.addEventListener('input', (e) => {
    setVolume(parseInt(e.target.value) / 100);
  });

  // Scrub click
  if (scrubArea && scrubBg) scrubArea.addEventListener('click', (e) => {
    if (!isInitialized()) return;
    const rect = scrubBg.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const meta = getMeta();
    seek(frac * meta.duration);
  });

  // Scrub drag
  let dragging = false;
  if (scrubDot) scrubDot.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
  document.addEventListener('mousemove', (e) => {
    if (!dragging || !scrubBg) return;
    const rect = scrubBg.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const meta = getMeta();
    seek(frac * meta.duration);
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  // Update display on interval
  if (updateInterval) clearInterval(updateInterval);
  updateInterval = setInterval(() => {
    _updateDisplay(songEl, timeEl, scrubFill, scrubDot, playBtn);
  }, 250);
}

function _toggleTrackList(radio, songEl, playBtn, timeEl, scrubFill, scrubDot) {
  // If already open, close it
  if (trackListEl) {
    trackListEl.remove();
    trackListEl = null;
    return;
  }

  const playlist = getPlaylist();
  const curIdx = getCurrentIndex();

  trackListEl = document.createElement('div');
  trackListEl.className = 'radio-tracklist';

  const header = document.createElement('div');
  header.className = 'radio-tracklist-header';
  header.innerHTML = `<span>LIBRARY \u00b7 ${playlist.length} tracks</span><button class="radio-tracklist-close">\u2715</button>`;
  trackListEl.appendChild(header);

  header.querySelector('.radio-tracklist-close').addEventListener('click', () => {
    trackListEl.remove();
    trackListEl = null;
  });

  const list = document.createElement('div');
  list.className = 'radio-tracklist-list';

  playlist.forEach((track, i) => {
    const row = document.createElement('div');
    row.className = 'radio-tracklist-row' + (i === curIdx ? ' active' : '');
    row.innerHTML = '<div>' + track.name + '</div><div style="font-size:8px;opacity:0.4">' + track.artist + '</div>';
    row.addEventListener('click', async () => {
      if (!isInitialized()) return;
      const meta = await playTrack(i);
      _setSongMarquee(songEl, meta || { name: track.name, artist: track.artist });
      if (playBtn) playBtn.textContent = '\u23F8';
      // Update active highlight
      list.querySelectorAll('.radio-tracklist-row').forEach((r, ri) => {
        r.classList.toggle('active', ri === i);
      });
    });
    list.appendChild(row);
  });

  trackListEl.appendChild(list);

  // Position above the radio
  radio.appendChild(trackListEl);

  // Scroll to current track
  const activeRow = list.querySelector('.active');
  if (activeRow) activeRow.scrollIntoView({ block: 'center' });
}

function _setSongMarquee(songEl, meta) {
  if (!songEl || !meta) return;
  const displayText = meta.name + (meta.artist && meta.artist !== 'Tower Radio' ? '  \u2014  ' + meta.artist : '');
  if (songEl.dataset.lastTrack !== displayText) {
    songEl.dataset.lastTrack = displayText;
    const sep = '     \u00b7\u00b7\u00b7     ';
    songEl.innerHTML = '<span class="radio-marquee">' + displayText + sep + displayText + sep + '</span>';
  }
}

function _updateDisplay(songEl, timeEl, scrubFill, scrubDot, playBtn) {
  const meta = getMeta();
  _setSongMarquee(songEl, meta);
  if (playBtn) playBtn.textContent = isPlaying() ? '\u23F8' : '\u25B6';

  if (meta.duration > 0) {
    const pos = getPosition();
    const dur = meta.duration;
    const frac = Math.min(1, pos / dur);
    if (scrubFill) scrubFill.style.width = (frac * 100) + '%';
    if (scrubDot) scrubDot.style.left = (frac * 100) + '%';
    if (timeEl) timeEl.textContent = _fmt(pos) + ' / ' + _fmt(dur);
  } else {
    if (scrubFill) scrubFill.style.width = '0%';
    if (scrubDot) scrubDot.style.left = '0%';
    if (timeEl) timeEl.textContent = '0:00';
  }

  // Update track list active row if open
  if (trackListEl) {
    const curIdx = getCurrentIndex();
    trackListEl.querySelectorAll('.radio-tracklist-row').forEach((r, i) => {
      r.classList.toggle('active', i === curIdx);
    });
  }
}

function _fmt(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

export function disposeRadio() {
  if (updateInterval) clearInterval(updateInterval);
  updateInterval = null;
  if (trackListEl) { trackListEl.remove(); trackListEl = null; }
}
