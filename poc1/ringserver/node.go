package main

// Rengaspalvelin renkaan solmuna (protokolla certiratio-direct/5 kuten
// web/src/direct.js): yhteys todennetaan (hello: avain ja haaste, auth:
// allekirjoitus), rekisteri tarkistetaan ja säilytetään, ja naapurilista
// kertoo paikalla olevat jäsenet. Jäsenet tekevät toisilleen tarjoukset
// (sig), ja palvelin välittää ne. Palvelin ei ole jäsen: hello.server = true.
// Rekisterin ulkopuolinen vastapuoli katkaistaan, kun rekisteri on ehtinyt
// tulla (memberGrace).
//
// Liittäminen renkaaseen: palvelin tulostaa liittämislinkin (kortti ja
// kertakäyttöinen tunnus). Jäsen avaa sen, ja sivu lähettää enroll-sanoman
// (tunnus, rengas, rekisteri). Palvelin allekirjoittaa server-tapahtuman, ja
// jäsen allekirjoittaa sen operaattorina ja julkaisee. Siitä lähtien palvelin
// kuuluu siihen renkaaseen. Kortti (osoitteet, portti, sormenjälki) on
// palvelimen allekirjoittama; seq kasvaa, kun osoitteet muuttuvat, ja kortit
// leviävät jäsenille (card).

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net"
	"os"
	"path/filepath"
	"regexp"
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
	name       string // palvelimen nimi rekisterissä
	token      string // liittämistunnus, kunnes palvelin on renkaassa
	port       int
	fp         string // DTLS-sormenjälki sha-256, base64url
	addrs      []string
	cards      map[string]*card // palvelin -> tuorein kortti (myös oma)
	loading    bool
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

func newNode(me *identity, dir, name string, port int, fp string, addrs []string) *node {
	n := &node{me: me, boot: randHex(4), dir: dir, name: name, port: port, fp: fp, addrs: addrs, cards: map[string]*card{},
		events: map[string]*event{}, unverified: map[string]*event{},
		links: map[*link]bool{}, seen: map[string]bool{}, state: &ringState{info: map[string]*event{}, servers: map[string]*event{}}}
	n.load()
	if !n.enrolled() {
		path := filepath.Join(dir, "enroll-token")
		if b, err := os.ReadFile(path); err == nil && len(b) == 16 {
			n.token = string(b)
		} else {
			n.token = randHex(8)
			os.WriteFile(path, []byte(n.token), 0o600)
		}
	} else {
		n.makeCard()
	}
	return n
}

func (n *node) enrolled() bool { return n.state.servers[n.me.id] != nil }

// --- Pysyvä rekisteri ------------------------------------------------------

type saved struct {
	Ring   string            `json:"ring"`
	Events []json.RawMessage `json:"events"`
	Cards  []*card           `json:"cards"`
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
	n.loading = true
	n.merge(s.Events)
	n.loading = false
	for _, c := range s.Cards {
		if c.Server != n.me.id {
			n.acceptCard(c)
		} else {
			n.cards[c.Server] = c // oma: seq jatkuu tästä
		}
	}
	log.Printf("rekisteri ladattu: rengas %s, %d jäsentä", n.ring, len(n.state.members))
}

func (n *node) save() {
	s := saved{Ring: n.ring}
	for _, e := range n.events {
		s.Events = append(s.Events, e.raw)
	}
	for _, c := range n.cards {
		s.Cards = append(s.Cards, c)
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
	before, wasEnrolled := len(n.state.members), n.enrolled()
	n.state = build(n.ring, all)
	if len(n.state.members) != before {
		log.Printf("rekisteri: %d jäsentä, %d palvelinta", len(n.state.members), len(n.state.servers))
	}
	if !wasEnrolled && n.enrolled() && !n.loading {
		log.Printf("liitetty renkaaseen %s (operaattori %s)", n.ring, n.state.servers[n.me.id].Operator)
		n.token = ""
		os.Remove(filepath.Join(n.dir, "enroll-token"))
		n.makeCard()
		n.broadcastCard(n.cards[n.me.id], nil)
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
	return map[string]any{"type": "hello", "id": n.me.id, "boot": n.boot, "ring": ring, "name": n.name,
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
		if n.links[l] && !n.state.isMember(l.id) && n.state.servers[l.id] == nil {
			n.dropLocked(l, "ei renkaan jäsen")
		}
	})
	for _, c := range n.cards {
		n.send(l, map[string]any{"type": "card", "card": c})
	}
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
	case typ == "enroll":
		n.onEnroll(l, msg)
	case typ == "card":
		var c card
		if json.Unmarshal(msg["card"], &c) == nil && n.acceptCard(&c) {
			n.broadcastCard(&c, l)
			n.save()
		}
	}
}

// onEnroll: jäsen liittää palvelimen renkaaseensa liittämistunnuksella.
func (n *node) onEnroll(l *link, msg map[string]json.RawMessage) {
	ring, operator := str(msg, "ring"), str(msg, "operator")
	reply := func(ok bool, why string, extra map[string]any) {
		m := map[string]any{"type": "enrolled", "ok": ok, "why": why}
		for k, v := range extra {
			m[k] = v
		}
		n.send(l, m)
	}
	if n.token == "" || str(msg, "token") != n.token {
		reply(false, "väärä tai käytetty liittämistunnus", nil)
		return
	}
	if !hex8Re.MatchString(ring) || operator != l.id || (n.ring != "" && n.ring != ring) {
		reply(false, "virheellinen pyyntö", nil)
		return
	}
	var list []json.RawMessage
	json.Unmarshal(msg["events"], &list)
	if len(list) > maxEvents {
		list = list[:maxEvents]
	}
	fresh := n.ring == ""
	n.ring = ring
	n.merge(list)
	if !n.state.isMember(operator) {
		if fresh {
			n.ring, n.events, n.state = "", map[string]*event{}, &ringState{info: map[string]*event{}, servers: map[string]*event{}}
		}
		reply(false, "pyytäjä ei ole renkaan jäsen", nil)
		return
	}
	n.save()
	empty := ""
	e := &event{Kind: "server", Ring: ring, Member: n.me.id, Key: n.me.key, Operator: operator, Name: n.name, Proof: &empty}
	sig, err := n.me.sign(payloadOf(e))
	if err != nil {
		reply(false, err.Error(), nil)
		return
	}
	log.Printf("liittämispyyntö renkaaseen %s, operaattori %s", ring, operator)
	n.sendHello()
	reply(true, "", map[string]any{"sig": sig, "name": n.name, "key": n.me.key, "server": n.me.id})
}

// makeCard: oma kortti nykyisillä osoitteilla, uusi seq. Kutsujalla lukko (tai käynnistys).
func (n *node) makeCard() {
	if n.ring == "" || len(n.addrs) == 0 {
		return
	}
	c := &card{Server: n.me.id, Seq: time.Now().UnixMilli(), Port: n.port, FP: n.fp, Addrs: slices.Clone(n.addrs)}
	if old := n.cards[n.me.id]; old != nil && c.Seq <= old.Seq {
		c.Seq = old.Seq + 1
	}
	sig, err := n.me.sign(cardPayload(n.ring, c))
	if err != nil {
		return
	}
	c.Sig = sig
	n.cards[n.me.id] = c
	log.Printf("kortti %d: %v portti %d", c.Seq, c.Addrs, c.Port)
}

var fpRe = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

// acceptCard: renkaan palvelimen kortti, jos se on tuoreempi kuin tallessa oleva.
func (n *node) acceptCard(c *card) bool {
	srv := n.state.servers[c.Server]
	if srv == nil || c.Seq <= 0 || c.Port <= 0 || c.Port > 65535 || !fpRe.MatchString(c.FP) || len(c.Addrs) == 0 || len(c.Addrs) > 8 {
		return false
	}
	for _, a := range c.Addrs {
		if ip := net.ParseIP(a); ip == nil || !usable(ip) {
			return false
		}
	}
	if old := n.cards[c.Server]; old != nil && old.Seq >= c.Seq {
		return false
	}
	if !verify(srv.Key, cardPayload(n.ring, c), c.Sig) {
		return false
	}
	n.cards[c.Server] = c
	return true
}

func (n *node) broadcastCard(c *card, except *link) {
	if c == nil {
		return
	}
	for o := range n.links {
		if o != except && o.verified {
			n.send(o, map[string]any{"type": "card", "card": c})
		}
	}
}

// setAddrs: osoitteet muuttuivat (puhelimen verkko vaihtui): uusi kortti kaikille.
func (n *node) setAddrs(addrs []string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if slices.Equal(addrs, n.addrs) || len(addrs) == 0 {
		return
	}
	log.Printf("osoitteet muuttuivat: %v → %v", n.addrs, addrs)
	n.addrs = addrs
	if n.enrolled() {
		n.makeCard()
		n.broadcastCard(n.cards[n.me.id], nil)
		n.save()
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
