// Yhteinen tekstivirta (direct.html): yksi kursori virran
// lopussa, johon kaikkien merkit lisätään saapumisjärjestyksessä, joten samaan
// aikaan kirjoitettu sekoittuu ("huuda toisen päälle"). Nimiä ei näytetä:
// kirjoittajan erottaa vain hänen arvotusta sävystään.
//
// Sivulla on oltava #stream (sisällä #hint ja #caret), lomake #say ja sen
// näkymätön syöte #text, joka avaa puhelimen näppäimistön.

import { appended, clampTint, randomTint } from './stream.js';

export const MAX_CHARS = 4096;
const MAX_SPANS = 4000;
const INPUT_RESET = 64; // näkymätön syöte tyhjennetään, kun siinä on näin monta merkkiä

/**
 * `send(text, tint)` lähettää omat merkit muille. Palauttaa
 * { tint, add(author, text, tint?), focus() }.
 */
export function createStreamView({ me, send }) {
  const $ = (id) => document.getElementById(id);
  const myTint = randomTint();
  const tints = new Map(); // kirjoittaja -> sävy (vertaisen lähettämä)

  function add(author, text, tint) {
    if (!text) return;
    const t = clampTint(tint);
    if (t) tints.set(author, t);
    const box = $('stream');
    const caret = $('caret');
    $('hint')?.remove();
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const last = caret.previousElementSibling;
    if (last?.dataset.author === author) {
      last.textContent += text;
    } else {
      const c = author === me() ? myTint : tints.get(author) ?? { h: 0, s: 0, d: 0 };
      const span = document.createElement('span');
      span.dataset.author = author;
      span.style.setProperty('--h', c.h);
      span.style.setProperty('--s', `${c.s}%`);
      span.style.setProperty('--d', `${c.d}%`);
      span.textContent = text;
      caret.before(span);
      while (box.childElementCount > MAX_SPANS) box.firstElementChild.remove();
    }
    if (atBottom) box.scrollTop = box.scrollHeight;
  }

  function out(text) {
    send(text, myTint);
    add(me(), text);
  }

  let prev = '';
  let composing = false;
  function onInput() {
    const input = $('text');
    const text = appended(prev, input.value);
    prev = input.value;
    if (text) out(text);
    if (!composing && input.value.length >= INPUT_RESET) {
      input.value = '';
      prev = '';
    }
  }

  function focus() {
    $('text').focus({ preventScroll: true });
  }

  $('text').oninput = onInput;
  $('text').addEventListener('compositionstart', () => { composing = true; });
  $('text').addEventListener('compositionend', () => { composing = false; onInput(); });
  $('text').addEventListener('focus', () => $('stream').classList.add('typing'));
  $('text').addEventListener('blur', () => $('stream').classList.remove('typing'));
  $('say').onsubmit = (ev) => { // Enter (↵) on rivinvaihto virtaan
    ev.preventDefault();
    onInput();
    out('\n');
    $('text').value = '';
    prev = '';
  };
  $('stream').addEventListener('click', focus);

  return { tint: myTint, add, focus };
}
