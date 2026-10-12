package main

// Rengaspalvelin renkaan solmuna (protokolla certiratio-direct/5 kuten
// web/src/direct.js): yhteys todennetaan (hello: avain ja haaste, auth:
// allekirjoitus), rekisteri tarkistetaan ja säilytetään, ja naapurilista
// kertoo paikalla olevat jäsenet. Jäsenet tekevät toisilleen tarjoukset
// (sig), ja palvelin välittää ne. Palvelin ei ole jäsen: hello.server = true.
// Rekisterin ulkopuolinen vastapuoli katkaistaan, kun rekisteri on ehtinyt
// tulla (memberGrace).

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"
)

const (
	protocol   = "certiratio-direct/5"
	maxMessage = 64 * 1024
	maxEvents  = 1000
	maxQueue   = 200
	maxSeen    = 20000
)

var (
	memberGrace = 5 * time.Second  // rekisteri ehtii tulla ennen jäsenyyden tarkistusta
	authTimeout = 10 * time.Second // todentamaton yhteys katkaistaan
)

var directed = map[string]bool{"sig": true, "sponsor": true, "claim": true, "vouched": true}

func randHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// conn: DataChannel tai testin vale (send ja close).
type conn interface {
	SendText(string) error
	Close() error
}

type link struct {
	c        conn
	who      string // osoite lokiin
	nonce    string
	id       string
	peerKey  string
	verified bool
	queue    []map[string]json.RawMessage
}

type node struct {
	mu         sync.Mutex
	me         *identity
	boot       string
	dir        string
	ring       string
	events     map[string]*event
	unverified map[string]*event
	state      *ringState
	links      map[*link]bool
	seen       map[string]bool
	seenOrder  []string
	lastHello  string
}

func newNode(me *identity, dir string) *node {
	n := &node{me: me, boot: randHex(4), dir: dir, events: map[string]*event{}, unverified: map[string]*event{},
		links: map[*link]bool{}, seen: map[string]bool{}, state: &ringState{info: map[string]*event{}}}
	n.load()
	return n
}

// --- Pysyvä rekisteri ------------------------------------------------------

type saved struct {
	Ring   string            `json:"ring"`
	Events []json.RawMessage `json:"events"`
}

func (n *node) load() {
	b, err := os.ReadFile(filepath.Join(n.dir, "ring.json"))
	if err != nil {
		return
	}
	var s saved
	if json.Unmarshal(b, &s) != nil || !hex8Re.MatchString(s.Ring) {
		return
	}
	n.ring = s.Ring
	n.merge(s.Events)
	log.Printf("rekisteri ladattu: rengas %s, %d jäsentä", n.ring, len(n.state.members))
}

func (n *node) save() {
	s := saved{Ring: n.ring}
	for _, e := range n.events {
		s.Events = append(s.Events, e.raw)
	}
	b, _ := json.Marshal(s)
	tmp := filepath.Join(n.dir, "ring.json.tmp")
	if os.WriteFile(tmp, b, 0o600) == nil {
		os.Rename(tmp, filepath.Join(n.dir, "ring.json"))
	}
}

func (n *node) keyOf(id string) string {
	if e := n.events[id+":f"]; e != nil {
		return e.Key
	}
	if e := n.events[id+":a"]; e != nil {
		return e.Key
	}
	return ""
}

// merge: tapahtumat rekisteriin allekirjoitusten tarkistuksen jälkeen. Kutsujalla lukko.
func (n *node) merge(list []json.RawMessage) bool {
	if n.ring == "" {
		return false
	}
	for _, raw := range list {
		e, ok := parseEvent(raw)
		if !ok || e.Ring != n.ring {
			continue
		}
		if have := n.events[e.ID]; have != nil && preferred(have, e) == have {
			continue
		}
		if len(n.unverified) < maxEvents {
			n.unverified[e.ID] = preferred(n.unverified[e.ID], e)
		}
	}
	added := false
	for progress := true; progress; {
		progress = false
		for id, e := range n.unverified {
			switch verifyEvent(e, n.keyOf) {
			case -1:
				continue
			case 1:
				n.events[id] = e
				added = true
			default:
				log.Printf("rekisteri: allekirjoitus ei kelpaa (%s), hylätty", id)
			}
			delete(n.unverified, id)
			progress = true
		}
	}
	if !added {
		return false
	}
	all := make([]*event, 0, len(n.events))
	for _, e := range n.events {
		all = append(all, e)
	}
	before := len(n.state.members)
	n.state = build(n.ring, all)
	if len(n.state.members) != before {
		log.Printf("rekisteri: %d jäsentä", len(n.state.members))
	}
	n.save()
	return true
}

// --- Yhteydet ---------------------------------------------------------------

func (n *node) send(l *link, msg map[string]any) {
	msg["protocol"] = protocol
	b, err := json.Marshal(msg)
	if err == nil {
		l.c.SendText(string(b))
	}
}

func (n *node) sendRaw(l *link, msg map[string]json.RawMessage) {
	b, err := json.Marshal(msg)
	if err == nil {
		l.c.SendText(string(b))
	}
}

// neighbours: todennetut jäsenyhteydet; tämä on hello.peers.
func (n *node) neighbours() []string {
	var ids []string
	for l := range n.links {
		if l.verified && n.state.isMember(l.id) && !slices.Contains(ids, l.id) {
			ids = append(ids, l.id)
		}
	}
	slices.Sort(ids)
	if ids == nil {
		ids = []string{}
	}
	return ids
}

func (n *node) helloMsg(l *link) map[string]any {
	var ring any
	if n.ring != "" {
		ring = n.ring
	}
	return map[string]any{"type": "hello", "id": n.me.id, "boot": n.boot, "ring": ring, "name": "rengaspalvelin",
		"icon": "🐕", "key": n.me.key, "nonce": l.nonce, "peers": n.neighbours(), "server": true}
}

func (n *node) eventsMsg() map[string]any {
	list := make([]json.RawMessage, 0, len(n.events))
	for _, e := range n.events {
		list = append(list, e.raw)
	}
	return map[string]any{"type": "events", "list": list}
}

// sendHello: naapurilista kaikille, kun se muuttuu. Kutsujalla lukko.
func (n *node) sendHello() {
	b, _ := json.Marshal(n.neighbours())
	if string(b) == n.lastHello {
		return
	}
	n.lastHello = string(b)
	for l := range n.links {
		n.send(l, n.helloMsg(l))
	}
}

// attach: DataChannel auki.
func (n *node) attach(c conn, who string) *link {
	n.mu.Lock()
	defer n.mu.Unlock()
	l := &link{c: c, who: who, nonce: randHex(8)}
	n.links[l] = true
	n.send(l, n.eventsMsg())
	n.send(l, n.helloMsg(l))
	time.AfterFunc(authTimeout, func() {
		n.mu.Lock()
		defer n.mu.Unlock()
		if n.links[l] && !l.verified {
			n.dropLocked(l, "ei todennusta")
		}
	})
	return l
}

func (n *node) detach(l *link) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.links[l] {
		delete(n.links, l)
		log.Printf("%s %s: suljettu", l.who, l.id)
		n.sendHello()
	}
}

func (n *node) dropLocked(l *link, why string) {
	if !n.links[l] {
		return
	}
	delete(n.links, l)
	log.Printf("%s %s: katkaistaan (%s)", l.who, l.id, why)
	go l.c.Close()
	n.sendHello()
}

// onMessage: yksi sanoma yhteydestä (järjestyksessä).
func (n *node) onMessage(l *link, data []byte) {
	if len(data) > maxMessage {
		return
	}
	var msg map[string]json.RawMessage
	if json.Unmarshal(data, &msg) != nil {
		return
	}
	var proto, typ string
	json.Unmarshal(msg["protocol"], &proto)
	json.Unmarshal(msg["type"], &typ)
	if proto != protocol {
		return
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	if !n.links[l] {
		return
	}
	switch {
	case typ == "hello":
		n.onHello(l, msg)
	case typ == "auth":
		n.onAuth(l, msg)
	case !l.verified:
		if len(l.queue) < maxQueue {
			l.queue = append(l.queue, msg)
		}
	default:
		n.handle(l, typ, msg)
	}
}

func str(msg map[string]json.RawMessage, k string) string {
	var s string
	json.Unmarshal(msg[k], &s)
	return s
}

func (n *node) onHello(l *link, msg map[string]json.RawMessage) {
	id, key, nonce, ring := str(msg, "id"), str(msg, "key"), str(msg, "nonce"), str(msg, "ring")
	if !hex8Re.MatchString(id) || id == n.me.id || nonce == "" || len(nonce) > 64 {
		return
	}
	if ring != "" && n.ring != "" && ring != n.ring {
		n.dropLocked(l, "toinen rengas")
		return
	}
	if idOf(key) != id {
		n.dropLocked(l, "avain ei vastaa tunnistetta")
		return
	}
	if reg := n.keyOf(id); (reg != "" && reg != key) || (l.peerKey != "" && l.peerKey != key) || (l.id != "" && l.id != id) {
		n.dropLocked(l, "väärä avain")
		return
	}
	if l.peerKey == "" {
		if n.ring == "" && ring != "" && hex8Re.MatchString(ring) {
			// Prototyyppi: ensimmäinen todennettu jäsen kertoo renkaan (vaihe 2: operaattorin server-tapahtuma).
			n.ring = ring
			log.Printf("rengas %s (ensimmäiseltä yhteydeltä)", ring)
		}
		l.id = id
		l.peerKey = key
		sig, err := n.me.sign(authPayload(nonce, n.me.id, id))
		if err == nil {
			n.send(l, map[string]any{"type": "auth", "sig": sig})
		}
	}
}

func (n *node) onAuth(l *link, msg map[string]json.RawMessage) {
	if l.peerKey == "" || l.verified {
		return
	}
	if !verify(l.peerKey, authPayload(l.nonce, l.id, n.me.id), str(msg, "sig")) {
		n.dropLocked(l, "todennus epäonnistui")
		return
	}
	// Sama jäsen toisesta yhteydestä (sivu ladattu uudelleen): vanha pois.
	for o := range n.links {
		if o != l && o.id == l.id {
			n.dropLocked(o, "korvattu uudella yhteydellä")
		}
	}
	l.verified = true
	log.Printf("%s %s: todennettu", l.who, l.id)
	for _, m := range l.queue {
		n.handle(l, str(m, "type"), m)
	}
	l.queue = nil
	if !n.links[l] {
		return
	}
	time.AfterFunc(memberGrace, func() {
		n.mu.Lock()
		defer n.mu.Unlock()
		if n.links[l] && !n.state.isMember(l.id) {
			n.dropLocked(l, "ei renkaan jäsen")
		}
	})
	n.sendHello()
}

func (n *node) remember(mid string) {
	n.seen[mid] = true
	n.seenOrder = append(n.seenOrder, mid)
	if len(n.seenOrder) > maxSeen {
		delete(n.seen, n.seenOrder[0])
		n.seenOrder = n.seenOrder[1:]
	}
}

func (n *node) handle(l *link, typ string, msg map[string]json.RawMessage) {
	switch {
	case typ == "events":
		var list []json.RawMessage
		if json.Unmarshal(msg["list"], &list) == nil {
			if len(list) > maxEvents {
				list = list[:maxEvents]
			}
			if n.merge(list) {
				n.sendHello() // uusi jäsen voi tulla naapurilistalle
			}
		}
	case typ == "chars" || typ == "ev" || directed[typ]:
		n.route(l, typ, msg)
	}
}

// route: välitys kuten direct.js:n route(); palvelimelle osoitettuja ei käsitellä.
func (n *node) route(via *link, typ string, msg map[string]json.RawMessage) {
	mid, from, to := str(msg, "mid"), str(msg, "from"), str(msg, "to")
	if mid == "" || len(mid) > 64 || n.seen[mid] || !hex8Re.MatchString(from) {
		return
	}
	n.remember(mid)
	if typ == "ev" {
		if n.merge([]json.RawMessage{msg["ev"]}) {
			n.sendHello()
		}
	}
	if directed[typ] && to == n.me.id {
		return
	}
	var ttl float64
	json.Unmarshal(msg["ttl"], &ttl)
	if !(ttl > 1) {
		return
	}
	fwd := make(map[string]json.RawMessage, len(msg))
	for k, v := range msg {
		fwd[k] = v
	}
	fwd["ttl"], _ = json.Marshal(ttl - 1)
	if directed[typ] {
		for o := range n.links {
			if o.verified && o.id == to {
				n.sendRaw(o, fwd)
				return
			}
		}
	}
	for o := range n.links {
		if o != via && o.verified {
			n.sendRaw(o, fwd)
		}
	}
}
