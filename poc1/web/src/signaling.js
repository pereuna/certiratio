// WebSocket-signalointiasiakas (POC1-BROWSER-P2P.md §3.2). Välittää vain
// SDP- ja ICE-sanomia; kirjanpitotapahtumia ei koskaan lähetetä tätä kautta.

export class Signaling extends EventTarget {
  constructor(url, room) {
    super();
    this.url = url;
    this.room = room;
    this.id = null;
    this.ws = null;
  }

  connect() {
    return new Promise((ok, fail) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room: this.room }));
      ws.onerror = () => fail(new Error('signaling-yhteys epäonnistui'));
      ws.onclose = () => this.#emit('close', {});
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'welcome') {
          this.id = msg.id;
          ok(msg);
        } else if (msg.type === 'error' && !this.id) {
          fail(new Error(msg.reason));
        }
        this.#emit(msg.type, msg);
      };
    });
  }

  send(to, data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'signal', to, data }));
    }
  }

  close() {
    this.ws?.close();
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
