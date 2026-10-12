package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/json"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeConn: selaimen pää DataChannelista; tallentaa palvelimen sanomat.
type fakeConn struct {
	mu     sync.Mutex
	got    []map[string]any
	closed bool
}

func (f *fakeConn) SendText(s string) error {
	var m map[string]any
	json.Unmarshal([]byte(s), &m)
	f.mu.Lock()
	f.got = append(f.got, m)
	f.mu.Unlock()
	return nil
}

func (f *fakeConn) Close() error { f.mu.Lock(); f.closed = true; f.mu.Unlock(); return nil }

// isClosed: palvelin sulkee yhteyden taustalla; odotetaan hetki.
func (f *fakeConn) isClosed() bool {
	for i := 0; i < 50; i++ {
		f.mu.Lock()
		c := f.closed
		f.mu.Unlock()
		if c {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}

func (f *fakeConn) last(typ string) map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := len(f.got) - 1; i >= 0; i-- {
		if f.got[i]["type"] == typ {
			return f.got[i]
		}
	}
	return nil
}

func (f *fakeConn) count(typ string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, m := range f.got {
		if m["type"] == typ {
			n++
		}
	}
	return n
}

func ident(t *testing.T) *identity {
	k, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	me, err := newIdentity(k)
	if err != nil {
		t.Fatal(err)
	}
	return me
}

func signedEvent(t *testing.T, e *event, signers map[string]*identity) json.RawMessage {
	e.ID = eventID(e.Kind, e.Member)
	e.Sigs = map[string]string{}
	for role, who := range signers {
		s, err := who.sign(payloadOf(e))
		if err != nil {
			t.Fatal(err)
		}
		e.Sigs[role] = s
	}
	m := map[string]any{"kind": e.Kind, "id": e.ID, "ring": e.Ring, "member": e.Member, "key": e.Key, "name": e.Name, "icon": e.Icon, "sigs": e.Sigs}
	if e.Kind == "found" {
		m["salt"] = e.Salt
	} else if e.Kind == "server" {
		m["operator"] = e.Operator
		delete(m, "icon")
	} else {
		m["left"], m["right"], m["proof"] = e.Left, e.Right, *e.Proof
	}
	b, _ := json.Marshal(m)
	return b
}

func msg(t *testing.T, m map[string]any) []byte {
	m["protocol"] = protocol
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// login: hello ja auth kuten selain; palauttaa yhteyden.
func login(t *testing.T, n *node, who *identity, ring string, events []json.RawMessage) (*link, *fakeConn) {
	f := &fakeConn{}
	l := n.attach(f, who.id)
	n.onMessage(l, msg(t, map[string]any{"type": "events", "list": events}))
	n.onMessage(l, msg(t, map[string]any{"type": "hello", "id": who.id, "key": who.key, "nonce": "c-" + who.id, "ring": ring}))
	auth := f.last("auth")
	if auth == nil || !verify(n.me.key, authPayload("c-"+who.id, n.me.id, who.id), auth["sig"].(string)) {
		t.Fatalf("%s: palvelimen auth ei kelpaa", who.id)
	}
	sig, _ := who.sign(authPayload(f.last("hello")["nonce"].(string), who.id, n.me.id))
	n.onMessage(l, msg(t, map[string]any{"type": "auth", "sig": sig}))
	if !l.verified {
		t.Fatalf("%s: ei todennettu", who.id)
	}
	return l, f
}

func peers(f *fakeConn) []string {
	var out []string
	for _, p := range f.last("hello")["peers"].([]any) {
		out = append(out, p.(string))
	}
	return out
}

func TestNodeIntroducesMembersAndRoutes(t *testing.T) {
	memberGrace, authTimeout = 100*time.Millisecond, 200*time.Millisecond
	isi, tortto, vieras := ident(t), ident(t), ident(t)
	salt := "0a1b2c3d"
	ring := ringIdOf(isi.key, salt)
	empty := ""
	found := signedEvent(t, &event{Kind: "found", Ring: ring, Member: isi.id, Key: isi.key, Salt: salt, Name: "isi", Icon: "👨"}, map[string]*identity{"member": isi})
	admit := signedEvent(t, &event{Kind: "admit", Ring: ring, Left: isi.id, Right: isi.id, Member: tortto.id, Key: tortto.key, Name: "Törttö", Icon: "🐈", Proof: &empty},
		map[string]*identity{"member": tortto, "left": isi})

	dir := t.TempDir()
	n := newNode(ident(t), dir, "testipalvelin", 40123, strings.Repeat("A", 43), []string{"fd00::1"})
	token := n.token
	if len(token) != 16 || n.enrolled() {
		t.Fatal("liittämätön palvelin ilman tunnusta")
	}
	li, fi := login(t, n, isi, ring, nil)
	// isi liittää palvelimen: väärä tunnus ei käy, oikea käy.
	n.onMessage(li, msg(t, map[string]any{"type": "enroll", "token": "0000000000000000", "ring": ring, "operator": isi.id, "events": []json.RawMessage{found, admit}}))
	if fi.last("enrolled")["ok"] != false || n.ring != "" {
		t.Fatal("väärä tunnus kelpasi")
	}
	n.onMessage(li, msg(t, map[string]any{"type": "enroll", "token": token, "ring": ring, "operator": isi.id, "events": []json.RawMessage{found, admit}}))
	en := fi.last("enrolled")
	if en["ok"] != true || !slices.Equal(n.state.members, []string{isi.id, tortto.id}) {
		t.Fatalf("liittäminen: %v, rengas %v", en, n.state.members)
	}
	srvEv := &event{Kind: "server", Ring: ring, Member: n.me.id, Key: n.me.key, Operator: isi.id, Name: "testipalvelin"}
	srvEv.ID = eventID("server", n.me.id)
	opSig, _ := isi.sign(payloadOf(srvEv))
	srvEv.Sigs = map[string]string{"member": en["sig"].(string), "operator": opSig}
	raw, _ := json.Marshal(map[string]any{"kind": "server", "id": srvEv.ID, "ring": ring, "member": n.me.id, "key": n.me.key, "operator": isi.id, "name": "testipalvelin", "sigs": srvEv.Sigs})
	n.onMessage(li, msg(t, map[string]any{"type": "ev", "ev": json.RawMessage(raw), "mid": isi.id + ":b:0", "from": isi.id, "ttl": 8}))
	if !n.enrolled() || n.token != "" {
		t.Fatal("palvelin ei liittynyt")
	}
	c := fi.last("card")
	if c == nil {
		t.Fatal("palvelin ei lähettänyt korttia")
	}
	cb, _ := json.Marshal(c["card"])
	var got card
	json.Unmarshal(cb, &got)
	if !verify(n.me.key, cardPayload(ring, &got), got.Sig) || got.Addrs[0] != "fd00::1" {
		t.Fatalf("kortti ei kelpaa: %+v", got)
	}
	n.onMessage(li, msg(t, map[string]any{"type": "enroll", "token": token, "ring": ring, "operator": isi.id}))
	if fi.last("enrolled")["ok"] != false {
		t.Fatal("käytetty tunnus kelpasi")
	}
	// Osoite vaihtuu: uusi kortti, suurempi seq.
	n.setAddrs([]string{"fd00::2"})
	cb, _ = json.Marshal(fi.last("card")["card"])
	var moved card
	json.Unmarshal(cb, &moved)
	if moved.Seq <= got.Seq || moved.Addrs[0] != "fd00::2" || !verify(n.me.key, cardPayload(ring, &moved), moved.Sig) {
		t.Fatalf("osoitteen vaihto: %+v", moved)
	}
	if got := peers(fi); !slices.Equal(got, []string{isi.id}) {
		t.Fatalf("isin naapurilista %v", got)
	}
	_, ft := login(t, n, tortto, ring, nil)
	if ft.last("card") == nil {
		t.Fatal("Törttö ei saanut korttia")
	}
	if got := peers(fi); !slices.Contains(got, tortto.id) {
		t.Fatalf("isi ei kuullut Törtöstä: %v", got)
	}
	if ft.last("events") == nil || len(ft.last("events")["list"].([]any)) != 3 {
		t.Fatal("Törttö ei saanut rekisteriä")
	}
	// isi tarjoaa Törtölle palvelimen kautta.
	n.onMessage(li, msg(t, map[string]any{"type": "sig", "to": tortto.id, "from": isi.id, "mid": isi.id + ":b:1", "ttl": 8, "data": map[string]any{"sdp": "x"}}))
	sig := ft.last("sig")
	if sig == nil || sig["from"] != isi.id || sig["ttl"].(float64) != 7 {
		t.Fatalf("tarjous ei mennyt perille: %v", sig)
	}
	n.onMessage(li, msg(t, map[string]any{"type": "sig", "to": tortto.id, "from": isi.id, "mid": isi.id + ":b:1", "ttl": 8, "data": map[string]any{}}))
	if ft.count("sig") != 1 {
		t.Fatal("kaksoiskappale välitettiin")
	}
	// Vieras: todennettu avain, mutta ei rekisterissä → katkaistaan.
	_, fv := login(t, n, vieras, ring, nil)
	time.Sleep(300 * time.Millisecond)
	if !fv.isClosed() {
		t.Fatal("vierasta ei katkaistu")
	}
	if slices.Contains(peers(fi), vieras.id) {
		t.Fatal("vieras naapurilistalla")
	}
	// Väärä avain tunnetulla tunnisteella.
	f := &fakeConn{}
	l := n.attach(f, "x")
	n.onMessage(l, msg(t, map[string]any{"type": "hello", "id": isi.id, "key": tortto.key, "nonce": "n", "ring": ring}))
	if !f.isClosed() {
		t.Fatal("väärä avain hyväksyttiin")
	}
	// Rekisteri säilyy uudelleenkäynnistyksen yli.
	n2 := newNode(n.me, dir, "testipalvelin", 40123, strings.Repeat("A", 43), []string{"fd00::1"})
	if !slices.Equal(n2.state.members, n.state.members) || n2.ring != ring || !n2.enrolled() || n2.cards[n.me.id].Seq < moved.Seq {
		t.Fatalf("tallennettu rekisteri %v", n2.state.members)
	}
}
