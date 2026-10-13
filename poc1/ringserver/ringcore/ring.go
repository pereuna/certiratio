package ringcore

// Rengasrekisteri, malli 2, kuten web/src/ring.js, identity.js:n verifyEvent
// ja registry.js:n resolve (docs/PROTOKOLLA.md). Tapahtuma säilytetään myös
// raakana JSONina: se välitetään eteenpäin sellaisenaan, ja kahdesta saman
// tunnisteen versiosta valitaan kuten selaimessa (JSON.stringify(a) <=
// JSON.stringify(b)), mikä vastaa saapunutta JSONia, koska selain lähettää
// JSON.stringifyn tuloksen.

import (
	"bytes"
	"encoding/json"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
)

const (
	Model     = 2 // rekisterimallin versio (hello.model)
	MaxName   = 24
	MaxLegacy = 8
)

var (
	icons   = []string{"🧑", "👩", "👨", "👧", "👦", "👵", "👴", "🐈", "🐕"}
	Hex8Re  = regexp.MustCompile(`^[0-9a-f]{8}$`)
	keyRe   = regexp.MustCompile(`^[A-Za-z0-9_-]{87}$`)
	sigRe   = regexp.MustCompile(`^[A-Za-z0-9_-]{86}$`)
	proofRe = regexp.MustCompile(`^([0-9a-f]{12})?$`)
	suffix  = map[string]string{"found": "f", "admit": "a", "server": "s", "node": "n", "retire": "r"}
)

type Event struct {
	Kind     string            `json:"kind"`
	ID       string            `json:"id"`
	Ring     string            `json:"ring"`
	Member   string            `json:"member"`
	Key      string            `json:"key"`
	Salt     string            `json:"salt"`
	Name     string            `json:"name"`
	Icon     string            `json:"icon"`
	Left     string            `json:"left"`
	Operator string            `json:"operator"`
	Right    string            `json:"right"`
	Proof    *string           `json:"proof"`
	Legacy   *[]string         `json:"legacy"`
	Sigs     map[string]string `json:"sigs"`
	raw      json.RawMessage
}

// Raw: tapahtuma sellaisenaan kuin se saapui (välitetään eteenpäin muuttamatta).
func (e *Event) Raw() json.RawMessage { return e.raw }

// ParseEvent: JSON → tapahtuma; ok kertoo, onko se muodoltaan kelvollinen.
func ParseEvent(raw json.RawMessage) (*Event, bool) {
	var e Event
	if json.Unmarshal(raw, &e) != nil {
		return nil, false
	}
	e.raw = append(json.RawMessage(nil), raw...)
	return &e, ValidEvent(&e)
}

// NewEvent: oma tapahtuma (raaka JSON tehdään kenttien perusteella).
func NewEvent(e *Event) *Event {
	e.ID = EventID(e.Kind, e.Member)
	m := map[string]any{"kind": e.Kind, "id": e.ID, "ring": e.Ring, "member": e.Member, "sigs": e.Sigs}
	set := func(k, v string) {
		if v != "" {
			m[k] = v
		}
	}
	set("key", e.Key)
	set("name", e.Name)
	set("left", e.Left)
	set("right", e.Right)
	set("operator", e.Operator)
	if e.Legacy != nil {
		m["legacy"] = *e.Legacy
	}
	e.raw, _ = json.Marshal(m)
	return e
}

func EventID(kind, member string) string {
	s, ok := suffix[kind]
	if !ok {
		s = "?"
	}
	return member + ":" + s
}

func (e *Event) sig(role string) bool { return sigRe.MatchString(e.Sigs[role]) }

func validLegacy(l *[]string) bool {
	if l == nil || len(*l) > MaxLegacy {
		return false
	}
	for i, x := range *l {
		if !Hex8Re.MatchString(x) || (i > 0 && (*l)[i-1] >= x) {
			return false
		}
	}
	return true
}

func ValidEvent(e *Event) bool {
	if !Hex8Re.MatchString(e.Ring) || !Hex8Re.MatchString(e.Member) || e.ID != EventID(e.Kind, e.Member) {
		return false
	}
	if e.Kind == "retire" {
		return (e.sig("left") && e.sig("right")) || e.sig("operator")
	}
	if !keyRe.MatchString(e.Key) || !CleanNameOK(e.Name) {
		return false
	}
	switch e.Kind {
	case "server":
		return Hex8Re.MatchString(e.Operator) && e.sig("member") && e.sig("operator")
	case "node":
		return Hex8Re.MatchString(e.Left) && Hex8Re.MatchString(e.Right) && e.Left != e.Right && validLegacy(e.Legacy) &&
			e.sig("member") && e.sig("left") && e.sig("right")
	}
	if !slices.Contains(icons, e.Icon) {
		return false
	}
	if e.Kind == "found" {
		return Hex8Re.MatchString(e.Salt) && e.sig("member")
	}
	return e.Kind == "admit" && Hex8Re.MatchString(e.Left) && Hex8Re.MatchString(e.Right) &&
		e.Proof != nil && proofRe.MatchString(*e.Proof) && e.sig("member") && e.sig("left") && (e.Left == e.Right || e.sig("right"))
}

// PayloadOf: allekirjoitettava sisältö (kanoninen JSON-taulukko).
func PayloadOf(e *Event) []byte {
	switch e.Kind {
	case "found":
		return Canon("found", e.Ring, e.Member, e.Key, e.Salt, e.Name, e.Icon)
	case "server":
		return Canon("server", e.Ring, e.Member, e.Key, e.Operator, e.Name)
	case "node":
		var l []string
		if e.Legacy != nil {
			l = *e.Legacy
		}
		return Canon("node", e.Ring, e.Left, e.Right, e.Member, e.Key, e.Name, strings.Join(l, ","))
	case "retire":
		return Canon("retire", e.Ring, e.Member)
	}
	proof := ""
	if e.Proof != nil {
		proof = *e.Proof
	}
	return Canon("admit", e.Ring, e.Left, e.Right, e.Member, e.Key, e.Name, e.Icon, proof)
}

// VerifyEvent: 1 kelpaa, 0 ei kelpaa, -1 allekirjoittajaa ei vielä tunneta.
// keyOf: henkilöjäsenen avain (found/admit), targetOf: palvelimen node- tai
// server-tapahtuma (retire).
func VerifyEvent(e *Event, keyOf func(string) string, targetOf func(string) *Event) int {
	p := PayloadOf(e)
	all := func(pairs ...[2]string) int {
		for _, s := range pairs {
			k := keyOf(s[0])
			if k == "" {
				return -1
			}
			if !Verify(k, p, e.Sigs[s[1]]) {
				return 0
			}
		}
		return 1
	}
	if e.Kind == "retire" {
		t := targetOf(e.Member)
		if t == nil {
			return -1
		}
		if t.Kind == "node" {
			return all([2]string{t.Left, "left"}, [2]string{t.Right, "right"})
		}
		return all([2]string{t.Operator, "operator"})
	}
	if IDOf(e.Key) != e.Member || !Verify(e.Key, p, e.Sigs["member"]) {
		return 0
	}
	switch e.Kind {
	case "found":
		if RingIDOf(e.Key, e.Salt) == e.Ring {
			return 1
		}
		return 0
	case "server":
		return all([2]string{e.Operator, "operator"})
	case "node":
		return all([2]string{e.Left, "left"}, [2]string{e.Right, "right"})
	}
	if e.Left == e.Right {
		return all([2]string{e.Left, "left"})
	}
	return all([2]string{e.Left, "left"}, [2]string{e.Right, "right"})
}

func Preferred(a, b *Event) *Event {
	if a == nil {
		return b
	}
	if b == nil || string(a.raw) <= string(b.raw) {
		return a
	}
	return b
}

// Server: rengassolmu (Node, Guardians) tai vanha palvelin (Operator).
type Server struct {
	Name      string
	Key       string
	Node      bool
	Guardians []string
	Operator  string
	Event     *Event
}

type Rejected struct{ ID, Why string }

type State struct {
	Members  []string           // henkilöjäsenet rengasjärjestyksessä
	Order    []string           // koko rengas: henkilöt ja solmut
	Info     map[string]*Event  // henkilö → hyväksytty tapahtuma
	Servers  map[string]*Server // voimassa olevat palvelimet
	Retired  map[string]bool
	Rejected []Rejected
	Pending  []string
}

func (r *State) IsMember(id string) bool { _, ok := r.Info[id]; return ok }

func EmptyState() *State {
	return &State{Info: map[string]*Event{}, Servers: map[string]*Server{}, Retired: map[string]bool{}}
}

func Adjacent(members []string, left, right string) bool {
	i := slices.Index(members, left)
	if i < 0 || !slices.Contains(members, right) {
		return false
	}
	return members[(i+1)%len(members)] == right
}

func Successor(members []string, id string) string {
	i := slices.Index(members, id)
	if i < 0 {
		return ""
	}
	return members[(i+1)%len(members)]
}

// Build: tapahtumat → rengas, deterministisesti kuten ring.js:n build.
func Build(ring string, evs []*Event) *State {
	byID := map[string]*Event{}
	for _, e := range evs {
		if e.Ring == ring && ValidEvent(e) {
			byID[e.ID] = Preferred(byID[e.ID], e)
		}
	}
	all := make([]*Event, 0, len(byID))
	for _, e := range byID {
		all = append(all, e)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].ID < all[j].ID })
	out := EmptyState()
	reject := func(e *Event, why string) { out.Rejected = append(out.Rejected, Rejected{e.ID, why}) }
	var nodesTodo, admits, servers, retires []*Event
	for _, e := range all {
		switch e.Kind {
		case "found":
			if len(out.Members) == 0 {
				out.Members = append(out.Members, e.Member)
				out.Order = append(out.Order, e.Member)
				out.Info[e.Member] = e
			} else {
				reject(e, "toinen aloitus")
			}
		case "admit":
			admits = append(admits, e)
		case "node":
			nodesTodo = append(nodesTodo, e)
		case "server":
			servers = append(servers, e)
		case "retire":
			retires = append(retires, e)
		}
	}
	if len(out.Members) == 0 {
		for _, e := range all {
			out.Pending = append(out.Pending, e.ID)
		}
		return out
	}
	place := func(e *Event) {
		at := slices.Index(out.Order, e.Left) + 1
		out.Order = slices.Insert(out.Order, at, e.Member)
	}
	nodes := map[string]bool{}
	legacyOK := map[string]bool{}
	todo := append(nodesTodo, admits...) // solmu ensin
	for progress := true; progress; {
		progress = false
		for i, e := range todo {
			why := ""
			if out.IsMember(e.Member) || nodes[e.Member] {
				why = "jo jäsen"
			} else if nodes[e.Left] || nodes[e.Right] {
				why = "solmu ei voi olla naapurina allekirjoittamassa"
			} else if !out.IsMember(e.Left) || !out.IsMember(e.Right) {
				continue // odottaa
			} else if !Adjacent(out.Members, e.Left, e.Right) {
				why = "naapurit eivät ole enää vierekkäin"
			}
			todo = slices.Delete(todo, i, i+1)
			switch {
			case why != "":
				reject(e, why)
			case e.Kind == "node":
				place(e)
				nodes[e.Member] = true
				for _, s := range *e.Legacy {
					legacyOK[s] = true
				}
				out.Servers[e.Member] = &Server{Name: e.Name, Key: e.Key, Node: true, Guardians: []string{e.Left, e.Right}, Event: e}
			default:
				at := slices.Index(out.Members, e.Left) + 1
				out.Members = slices.Insert(out.Members, at, e.Member)
				place(e)
				out.Info[e.Member] = e
			}
			progress = true
			break // alusta uudelleen: järjestys pysyy samana kaikilla
		}
	}
	for _, e := range todo {
		out.Pending = append(out.Pending, e.ID)
	}
	for _, e := range servers {
		switch {
		case out.IsMember(e.Member) || nodes[e.Member]:
			reject(e, "jäsen ei voi olla palvelin")
		case len(nodes) > 0 && !legacyOK[e.Member]:
			reject(e, "vanha palvelinmerkintä ei kelpaa solmujen rinnalla")
		case !out.IsMember(e.Operator):
			out.Pending = append(out.Pending, e.ID)
		default:
			out.Servers[e.Member] = &Server{Name: e.Name, Key: e.Key, Operator: e.Operator, Event: e}
		}
	}
	for _, e := range retires {
		s := out.Servers[e.Member]
		if s == nil {
			out.Pending = append(out.Pending, e.ID)
			continue
		}
		if (s.Node && (e.Sigs["left"] == "" || e.Sigs["right"] == "")) || (!s.Node && e.Sigs["operator"] == "") {
			reject(e, "väärät allekirjoittajat")
			continue
		}
		delete(out.Servers, e.Member)
		if s.Node {
			out.Order = slices.DeleteFunc(out.Order, func(x string) bool { return x == e.Member })
		}
		out.Retired[e.Member] = true
	}
	return out
}

// Registry: tarkistetut tapahtumat ja niistä rakennettu rengas (vähittäinen
// merge kuten direct.js ja ringserver; sama tulos kuin Resolve).
type Registry struct {
	Ring       string
	Events     map[string]*Event // tunniste → tarkistettu (Preferred tarkistetuista)
	Unverified map[string]*Event // versio (raaka JSON) → allekirjoittajaa ei vielä tunneta
	Invalid    map[string]bool   // tunnisteet, joiden jokin versio ei kelvannut
	State      *State
	MaxPending int
}

func NewRegistry(ring string) *Registry {
	return &Registry{Ring: ring, Events: map[string]*Event{}, Unverified: map[string]*Event{}, Invalid: map[string]bool{},
		State: EmptyState(), MaxPending: 1000}
}

func (g *Registry) KeyOf(id string) string {
	if e := g.Events[id+":f"]; e != nil {
		return e.Key
	}
	if e := g.Events[id+":a"]; e != nil {
		return e.Key
	}
	return ""
}

func (g *Registry) TargetOf(id string) *Event {
	if e := g.Events[id+":n"]; e != nil {
		return e
	}
	return g.Events[id+":s"]
}

// Merge: tapahtumat allekirjoitusten tarkistuksen jälkeen; true, jos rekisteri muuttui.
// invalid kutsutaan jokaisesta hylätystä versiosta.
func (g *Registry) Merge(list []json.RawMessage, invalid func(id string)) bool {
	for _, raw := range list {
		e, ok := ParseEvent(raw)
		if !ok || e.Ring != g.Ring {
			continue
		}
		if have := g.Events[e.ID]; have != nil && Preferred(have, e) == have {
			continue
		}
		if len(g.Unverified) < g.MaxPending {
			g.Unverified[string(e.raw)] = e
		}
	}
	added := false
	for progress := true; progress; {
		progress = false
		for k, e := range g.Unverified {
			v := VerifyEvent(e, g.KeyOf, g.TargetOf)
			if v == -1 {
				continue
			}
			delete(g.Unverified, k)
			progress = true
			if v == 1 {
				if Preferred(g.Events[e.ID], e) == e {
					g.Events[e.ID] = e
					added = true
				}
			} else {
				g.Invalid[e.ID] = true
				if invalid != nil {
					invalid(e.ID)
				}
			}
		}
	}
	if added {
		all := make([]*Event, 0, len(g.Events))
		for _, e := range g.Events {
			all = append(all, e)
		}
		g.State = Build(g.Ring, all)
	}
	return added
}

// Summary: vertailukelpoinen yhteenveto kuten registry.js:n summary (testivektorien expect).
type Summary struct {
	Members    []string                  `json:"members"`
	Order      []string                  `json:"order"`
	Servers    map[string]map[string]any `json:"servers"`
	Retired    []string                  `json:"retired"`
	Rejected   []string                  `json:"rejected"`
	Pending    []string                  `json:"pending"`
	Invalid    []string                  `json:"invalid"`
	Unverified []string                  `json:"unverified"`
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// Resolve: koko tapahtumajoukko kerralla (yhteensopivuustestit).
func Resolve(ring string, list []json.RawMessage) (*Registry, Summary) {
	g := NewRegistry(ring)
	g.MaxPending = len(list) + 1
	// Kaikki versiot tarkistetaan (ei vain kulloinkin suosituinta), kuten registry.js.
	for _, raw := range list {
		if e, ok := ParseEvent(raw); ok && e.Ring == ring {
			g.Unverified[string(e.raw)] = e
		}
	}
	g.Merge(nil, nil)
	if len(g.Events) == 0 {
		g.State = Build(ring, nil)
	}
	s := Summary{Members: nonNil(g.State.Members), Order: nonNil(g.State.Order), Servers: map[string]map[string]any{}}
	for id, v := range g.State.Servers {
		if v.Node {
			s.Servers[id] = map[string]any{"node": true, "guardians": v.Guardians}
		} else {
			s.Servers[id] = map[string]any{"operator": v.Operator}
		}
	}
	for id := range g.State.Retired {
		s.Retired = append(s.Retired, id)
	}
	for _, r := range g.State.Rejected {
		s.Rejected = append(s.Rejected, r.ID)
	}
	s.Pending = slices.Clone(g.State.Pending)
	for id := range g.Invalid {
		if g.Events[id] == nil {
			s.Invalid = append(s.Invalid, id)
		}
	}
	seen := map[string]bool{}
	for _, e := range g.Unverified {
		if g.Events[e.ID] == nil && !seen[e.ID] {
			seen[e.ID] = true
			s.Unverified = append(s.Unverified, e.ID)
		}
	}
	for _, l := range []*[]string{&s.Retired, &s.Rejected, &s.Pending, &s.Invalid, &s.Unverified} {
		*l = nonNil(*l)
		slices.Sort(*l)
	}
	return g, s
}

// Card: rengaspalvelimen osoitteet ja sormenjälki, palvelimen allekirjoittama.
type Card struct {
	Server string   `json:"server"`
	Seq    int64    `json:"seq"`
	Port   int      `json:"port"`
	FP     string   `json:"fp"` // sha-256, base64url
	Addrs  []string `json:"addrs"`
	Sig    string   `json:"sig"`
}

func CardPayload(ring string, c *Card) []byte {
	return Canon("card", ring, c.Server, strconv.FormatInt(c.Seq, 10), strconv.Itoa(c.Port), c.FP, strings.Join(c.Addrs, ","))
}

// Compact: tiedostosta luetut tapahtumat ilman välilyöntejä, jolloin raaka
// JSON on sama kuin selaimen JSON.stringify (Preferred vertaa sitä).
func Compact(list []json.RawMessage) []json.RawMessage {
	out := make([]json.RawMessage, 0, len(list))
	for _, raw := range list {
		var b bytes.Buffer
		if json.Compact(&b, raw) == nil {
			out = append(out, b.Bytes())
		}
	}
	return out
}

// ValidLegacy: vanhojen palvelinten luettelo (node.legacy): kasvava, ei toistoja, enintään MaxLegacy.
func ValidLegacy(l []string) bool { return validLegacy(&l) }
