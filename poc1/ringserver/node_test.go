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

	"certiratio/ringserver/ringcore"
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

type identity = ringcore.Identity

func ident(t *testing.T) *identity {
	k, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	me, err := ringcore.NewIdentity(k)
	if err != nil {
		t.Fatal(err)
	}
	return me
}

func signedEvent(t *testing.T, e *ringcore.Event, signers map[string]*identity) json.RawMessage {
	e.ID = ringcore.EventID(e.Kind, e.Member)
	e.Sigs = map[string]string{}
	for role, who := range signers {
		s, err := who.Sign(ringcore.PayloadOf(e))
		if err != nil {
			t.Fatal(err)
		}
		e.Sigs[role] = s
	}
	m := map[string]any{"kind": e.Kind, "id": e.ID, "ring": e.Ring, "member": e.Member, "key": e.Key, "name": e.Name, "icon": e.Icon, "sigs": e.Sigs}
	switch e.Kind {
	case "found":
		m["salt"] = e.Salt
	case "admit":
		m["left"], m["right"], m["proof"] = e.Left, e.Right, *e.Proof
	default:
		return ringcore.NewEvent(e).Raw()
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
	l := n.attach(f, who.ID)
	n.onMessage(l, msg(t, map[string]any{"type": "events", "list": events}))
	n.onMessage(l, msg(t, map[string]any{"type": "hello", "id": who.ID, "key": who.Key, "nonce": "c-" + who.ID, "ring": ring}))
	auth := f.last("auth")
	if auth == nil || !ringcore.Verify(n.me.Key, ringcore.AuthPayload("c-"+who.ID, n.me.ID, who.ID), auth["sig"].(string)) {
		t.Fatalf("%s: palvelimen auth ei kelpaa", who.ID)
	}
	sig, _ := who.Sign(ringcore.AuthPayload(f.last("hello")["nonce"].(string), who.ID, n.me.ID))
	n.onMessage(l, msg(t, map[string]any{"type": "auth", "sig": sig}))
	if !l.verified {
		t.Fatalf("%s: ei todennettu", who.ID)
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
	ring := ringcore.RingIDOf(isi.Key, salt)
	empty := ""
	found := signedEvent(t, &ringcore.Event{Kind: "found", Ring: ring, Member: isi.ID, Key: isi.Key, Salt: salt, Name: "isi", Icon: "👨"}, map[string]*identity{"member": isi})
	admit := signedEvent(t, &ringcore.Event{Kind: "admit", Ring: ring, Left: isi.ID, Right: isi.ID, Member: tortto.ID, Key: tortto.Key, Name: "Törttö", Icon: "🐈", Proof: &empty},
		map[string]*identity{"member": tortto, "left": isi})

	dir := t.TempDir()
	n := newNode(ident(t), dir, "testipalvelin", 40123, strings.Repeat("A", 43), []string{"fd00::1"})
	token := n.token
	if len(token) != 16 || n.enrolled() {
		t.Fatal("liittämätön palvelin ilman tunnusta")
	}
	li, fi := login(t, n, isi, ring, nil)
	// isi liittää palvelimen rengassolmuksi itsensä ja Törtön väliin: väärä tunnus,
	// vanha sivu (ei oikeaa naapuria) ja toisen puolesta pyytäminen eivät käy.
	evs := []json.RawMessage{found, admit}
	enroll := func(extra map[string]any) map[string]any {
		m := map[string]any{"type": "enroll", "token": token, "ring": ring, "left": isi.ID, "right": tortto.ID, "legacy": []string{}, "events": evs}
		for k, v := range extra {
			m[k] = v
		}
		n.onMessage(li, msg(t, m))
		return fi.last("enrolled")
	}
	if enroll(map[string]any{"token": "0000000000000000"})["ok"] != false || n.ring != "" {
		t.Fatal("väärä tunnus kelpasi")
	}
	if enroll(map[string]any{"right": nil})["ok"] != false || n.ring != "" {
		t.Fatal("vanhan sivun pyyntö (yksi operaattori) kelpasi")
	}
	if enroll(map[string]any{"left": tortto.ID, "right": isi.ID})["ok"] != false {
		t.Fatal("pyysi toisen puolesta")
	}
	if enroll(map[string]any{"legacy": []string{"0000000a"}})["ok"] != false {
		t.Fatal("tuntematon vanha palvelin kelpasi")
	}
	en := enroll(nil)
	if en["ok"] != true || en["kind"] != "node" || !slices.Equal(n.state.Members, []string{isi.ID, tortto.ID}) {
		t.Fatalf("liittäminen: %v, rengas %v", en, n.state.Members)
	}
	nodeEv := &ringcore.Event{Kind: "node", Ring: ring, Member: n.me.ID, Key: n.me.Key, Name: "testipalvelin", Left: isi.ID, Right: tortto.ID, Legacy: &[]string{}}
	leftSig, _ := isi.Sign(ringcore.PayloadOf(nodeEv))
	// Pelkkä vasen naapuri ei riitä (tapahtuma ei ole edes muodoltaan kelvollinen).
	half := ringcore.NewEvent(&ringcore.Event{Kind: "node", Ring: ring, Member: n.me.ID, Key: n.me.Key, Name: "testipalvelin", Left: isi.ID, Right: tortto.ID,
		Legacy: &[]string{}, Sigs: map[string]string{"member": en["sig"].(string), "left": leftSig}})
	n.onMessage(li, msg(t, map[string]any{"type": "ev", "ev": half.Raw(), "mid": isi.ID + ":b:0", "from": isi.ID, "ttl": 8}))
	if n.enrolled() {
		t.Fatal("yhden naapurin hyväksyntä riitti")
	}
	rightSig, _ := tortto.Sign(ringcore.PayloadOf(nodeEv))
	nodeEv.Sigs = map[string]string{"member": en["sig"].(string), "left": leftSig, "right": rightSig}
	raw := ringcore.NewEvent(nodeEv).Raw()
	n.onMessage(li, msg(t, map[string]any{"type": "ev", "ev": raw, "mid": isi.ID + ":b:00", "from": isi.ID, "ttl": 8}))
	if !n.enrolled() || n.token != "" || !slices.Equal(n.state.Servers[n.me.ID].Guardians, []string{isi.ID, tortto.ID}) {
		t.Fatal("palvelin ei liittynyt solmuksi")
	}
	if !slices.Equal(n.state.Order, []string{isi.ID, n.me.ID, tortto.ID}) {
		t.Fatalf("rengasjärjestys %v", n.state.Order)
	}
	c := fi.last("card")
	if c == nil {
		t.Fatal("palvelin ei lähettänyt korttia")
	}
	cb, _ := json.Marshal(c["card"])
	var got ringcore.Card
	json.Unmarshal(cb, &got)
	if !ringcore.Verify(n.me.Key, ringcore.CardPayload(ring, &got), got.Sig) || got.Addrs[0] != "fd00::1" {
		t.Fatalf("kortti ei kelpaa: %+v", got)
	}
	if enroll(nil)["ok"] != false {
		t.Fatal("käytetty tunnus kelpasi")
	}
	// Osoite vaihtuu: uusi kortti, suurempi seq.
	n.setAddrs([]string{"fd00::2"})
	cb, _ = json.Marshal(fi.last("card")["card"])
	var moved ringcore.Card
	json.Unmarshal(cb, &moved)
	if moved.Seq <= got.Seq || moved.Addrs[0] != "fd00::2" || !ringcore.Verify(n.me.Key, ringcore.CardPayload(ring, &moved), moved.Sig) {
		t.Fatalf("osoitteen vaihto: %+v", moved)
	}
	if got := peers(fi); !slices.Equal(got, []string{isi.ID}) {
		t.Fatalf("isin naapurilista %v", got)
	}
	_, ft := login(t, n, tortto, ring, nil)
	if ft.last("card") == nil {
		t.Fatal("Törttö ei saanut korttia")
	}
	if got := peers(fi); !slices.Contains(got, tortto.ID) {
		t.Fatalf("isi ei kuullut Törtöstä: %v", got)
	}
	if ft.last("events") == nil || len(ft.last("events")["list"].([]any)) != 3 {
		t.Fatal("Törttö ei saanut rekisteriä")
	}
	// isi tarjoaa Törtölle palvelimen kautta.
	n.onMessage(li, msg(t, map[string]any{"type": "sig", "to": tortto.ID, "from": isi.ID, "mid": isi.ID + ":b:1", "ttl": 8, "data": map[string]any{"sdp": "x"}}))
	sig := ft.last("sig")
	if sig == nil || sig["from"] != isi.ID || sig["ttl"].(float64) != 7 {
		t.Fatalf("tarjous ei mennyt perille: %v", sig)
	}
	n.onMessage(li, msg(t, map[string]any{"type": "sig", "to": tortto.ID, "from": isi.ID, "mid": isi.ID + ":b:1", "ttl": 8, "data": map[string]any{}}))
	if ft.count("sig") != 1 {
		t.Fatal("kaksoiskappale välitettiin")
	}
	// Kahdenkeskinen viesti ei kulje palvelimen kautta.
	n.onMessage(li, msg(t, map[string]any{"type": "dm", "to": tortto.ID, "from": isi.ID, "id": "0123456789abcdef", "text": "moi", "mid": isi.ID + ":b:2", "ttl": 8}))
	if ft.count("dm") != 0 {
		t.Fatal("palvelin välitti kahdenkeskisen viestin")
	}
	// Vieras: todennettu avain, mutta ei rekisterissä → katkaistaan.
	_, fv := login(t, n, vieras, ring, nil)
	time.Sleep(300 * time.Millisecond)
	if !fv.isClosed() {
		t.Fatal("vierasta ei katkaistu")
	}
	if slices.Contains(peers(fi), vieras.ID) {
		t.Fatal("vieras naapurilistalla")
	}
	// Väärä avain tunnetulla tunnisteella.
	f := &fakeConn{}
	l := n.attach(f, "x")
	n.onMessage(l, msg(t, map[string]any{"type": "hello", "id": isi.ID, "key": tortto.Key, "nonce": "n", "ring": ring}))
	if !f.isClosed() {
		t.Fatal("väärä avain hyväksyttiin")
	}
	// Rekisteri säilyy uudelleenkäynnistyksen yli.
	n2 := newNode(n.me, dir, "testipalvelin", 40123, strings.Repeat("A", 43), []string{"fd00::1"})
	if !slices.Equal(n2.state.Members, n.state.Members) || n2.ring != ring || !n2.enrolled() || n2.cards[n.me.ID].Seq < moved.Seq {
		t.Fatalf("tallennettu rekisteri %v", n2.state.Members)
	}
	// Huoltajat poistavat palvelinroolin: kortti ei enää kelpaa, eikä palvelin liity uudelleen.
	retire := &ringcore.Event{Kind: "retire", Ring: ring, Member: n.me.ID}
	l1, _ := isi.Sign(ringcore.PayloadOf(retire))
	r1, _ := tortto.Sign(ringcore.PayloadOf(retire))
	retire.Sigs = map[string]string{"left": l1, "right": r1}
	n.onMessage(li, msg(t, map[string]any{"type": "ev", "ev": ringcore.NewEvent(retire).Raw(), "mid": isi.ID + ":b:9", "from": isi.ID, "ttl": 8}))
	if n.enrolled() || !n.retired() || n.cards[n.me.ID] != nil || slices.Contains(n.state.Order, n.me.ID) {
		t.Fatal("palvelinrooli ei poistunut")
	}
	n3 := newNode(n.me, dir, "testipalvelin", 40123, strings.Repeat("A", 43), []string{"fd00::1"})
	if !n3.retired() || n3.token != "" {
		t.Fatal("poistettu palvelin tarjoaa liittämistä uudelleenkäynnistyksen jälkeen")
	}
}
