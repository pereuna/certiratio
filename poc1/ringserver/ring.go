package main

// Rengasrekisteri kuten web/src/ring.js ja identity.js:n verifyEvent.
// Tapahtuma säilytetään myös raakana JSONina: se välitetään eteenpäin
// sellaisenaan, ja kahdesta saman tunnisteen versiosta valitaan kuten
// selaimessa (JSON.stringify(a) <= JSON.stringify(b)), mikä vastaa
// saapunutta JSONia, koska selain lähettää JSON.stringifyn tuloksen.

import (
	"encoding/json"
	"regexp"
	"slices"
	"sort"
)

const maxName = 24

var (
	icons   = []string{"🧑", "👩", "👨", "👧", "👦", "👵", "👴", "🐈", "🐕"}
	hex8Re  = regexp.MustCompile(`^[0-9a-f]{8}$`)
	keyRe   = regexp.MustCompile(`^[A-Za-z0-9_-]{87}$`)
	sigRe   = regexp.MustCompile(`^[A-Za-z0-9_-]{86}$`)
	proofRe = regexp.MustCompile(`^([0-9a-f]{12})?$`)
)

type event struct {
	Kind   string            `json:"kind"`
	ID     string            `json:"id"`
	Ring   string            `json:"ring"`
	Member string            `json:"member"`
	Key    string            `json:"key"`
	Salt   string            `json:"salt"`
	Name   string            `json:"name"`
	Icon   string            `json:"icon"`
	Left   string            `json:"left"`
	Right  string            `json:"right"`
	Proof  *string           `json:"proof"`
	Sigs   map[string]string `json:"sigs"`
	raw    json.RawMessage
}

func parseEvent(raw json.RawMessage) (*event, bool) {
	var e event
	if json.Unmarshal(raw, &e) != nil {
		return nil, false
	}
	e.raw = append(json.RawMessage(nil), raw...)
	return &e, validEvent(&e)
}

func eventID(kind, member string) string {
	if kind == "found" {
		return member + ":f"
	}
	return member + ":a"
}

func (e *event) sig(role string) bool { return sigRe.MatchString(e.Sigs[role]) }

func validEvent(e *event) bool {
	if !hex8Re.MatchString(e.Ring) || !hex8Re.MatchString(e.Member) || e.ID != eventID(e.Kind, e.Member) || !keyRe.MatchString(e.Key) {
		return false
	}
	if !slices.Contains(icons, e.Icon) || !cleanNameOK(e.Name) {
		return false
	}
	if e.Kind == "found" {
		return hex8Re.MatchString(e.Salt) && e.sig("member")
	}
	return e.Kind == "admit" && hex8Re.MatchString(e.Left) && hex8Re.MatchString(e.Right) &&
		e.Proof != nil && proofRe.MatchString(*e.Proof) && e.sig("member") && e.sig("left") && (e.Left == e.Right || e.sig("right"))
}

func payloadOf(e *event) []byte {
	if e.Kind == "found" {
		return canon("found", e.Ring, e.Member, e.Key, e.Salt, e.Name, e.Icon)
	}
	return canon("admit", e.Ring, e.Left, e.Right, e.Member, e.Key, e.Name, e.Icon, *e.Proof)
}

// verifyEvent: 1 kelpaa, 0 ei kelpaa, -1 allekirjoittajan avainta ei vielä tunneta.
func verifyEvent(e *event, keyOf func(string) string) int {
	if idOf(e.Key) != e.Member {
		return 0
	}
	p := payloadOf(e)
	if !verify(e.Key, p, e.Sigs["member"]) {
		return 0
	}
	if e.Kind == "found" {
		if ringIdOf(e.Key, e.Salt) == e.Ring {
			return 1
		}
		return 0
	}
	signers := [][2]string{{e.Left, "left"}}
	if e.Left != e.Right {
		signers = append(signers, [2]string{e.Right, "right"})
	}
	for _, s := range signers {
		k := keyOf(s[0])
		if k == "" {
			return -1
		}
		if !verify(k, p, e.Sigs[s[1]]) {
			return 0
		}
	}
	return 1
}

func preferred(a, b *event) *event {
	if a == nil {
		return b
	}
	if b == nil || string(a.raw) <= string(b.raw) {
		return a
	}
	return b
}

type ringState struct {
	members []string
	info    map[string]*event // jäsen -> hyväksytty tapahtuma
}

func (r *ringState) isMember(id string) bool { _, ok := r.info[id]; return ok }

func adjacent(members []string, left, right string) bool {
	i := slices.Index(members, left)
	if i < 0 || !slices.Contains(members, right) {
		return false
	}
	return members[(i+1)%len(members)] == right
}

// build: tapahtumat → rengas, deterministisesti kuten ring.js.
func build(ring string, evs []*event) *ringState {
	byID := map[string]*event{}
	for _, e := range evs {
		if e.Ring == ring && validEvent(e) {
			byID[e.ID] = preferred(byID[e.ID], e)
		}
	}
	all := make([]*event, 0, len(byID))
	for _, e := range byID {
		all = append(all, e)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].ID < all[j].ID })
	out := &ringState{info: map[string]*event{}}
	var todo []*event
	for _, e := range all {
		if e.Kind == "found" {
			if len(out.members) == 0 {
				out.members = append(out.members, e.Member)
				out.info[e.Member] = e
			}
		} else {
			todo = append(todo, e)
		}
	}
	if len(out.members) == 0 {
		return out
	}
	for progress := true; progress; {
		progress = false
		for i, e := range todo {
			reject := false
			if out.isMember(e.Member) {
				reject = true
			} else if !out.isMember(e.Left) || !out.isMember(e.Right) {
				continue // odottaa
			} else if !adjacent(out.members, e.Left, e.Right) {
				reject = true
			}
			todo = slices.Delete(todo, i, i+1)
			if !reject {
				at := slices.Index(out.members, e.Left) + 1
				out.members = slices.Insert(out.members, at, e.Member)
				out.info[e.Member] = e
			}
			progress = true
			break // alusta uudelleen: järjestys pysyy samana kaikilla
		}
	}
	return out
}
