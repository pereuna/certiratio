// ringcheck: rekisterimallin yhteensopivuustesti ilman verkkoa ja WebRTC:tä
// (docs/PROTOKOLLA.md). Ajaa testivektorit ringcore-paketilla; käännetään
// myös muille alustoille (wasm, Plan 9, arm64), jotta sama ydin voidaan
// todeta yhteensopivaksi niissä.
//
//	ringcheck tests/vectors/conformance.json
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"slices"

	"certiratio/ringserver/ringcore"
)

type vectors struct {
	Model int `json:"model"`
	Cases []struct {
		Name   string            `json:"name"`
		Ring   string            `json:"ring"`
		Events []json.RawMessage `json:"events"`
		Expect json.RawMessage   `json:"expect"`
	} `json:"cases"`
}

func canonical(v any) string {
	b, _ := json.Marshal(v)
	var x any
	json.Unmarshal(b, &x)
	b, _ = json.Marshal(x) // avaimet aakkosjärjestyksessä
	return string(b)
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "käyttö: ringcheck conformance.json")
		os.Exit(2)
	}
	b, err := os.ReadFile(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	var v vectors
	if err := json.Unmarshal(b, &v); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	fmt.Printf("ringcheck %s/%s, rekisterimalli %d (vektorit %d)\n", runtime.GOOS, runtime.GOARCH, ringcore.Model, v.Model)
	fail := v.Model != ringcore.Model
	for _, c := range v.Cases {
		evs := ringcore.Compact(c.Events)
		rev := slices.Clone(evs)
		slices.Reverse(rev)
		var want any
		json.Unmarshal(c.Expect, &want)
		ok := true
		for _, list := range [][]json.RawMessage{evs, rev} {
			_, got := ringcore.Resolve(c.Ring, list)
			if canonical(got) != canonical(want) {
				ok = false
				fmt.Printf("  saatiin   %s\n  odotettiin %s\n", canonical(got), canonical(want))
			}
		}
		mark := "ok  "
		if !ok {
			mark, fail = "FAIL", true
		}
		fmt.Printf("%s %s\n", mark, c.Name)
	}
	if fail {
		os.Exit(1)
	}
	fmt.Println("YHTEENSOPIVA")
}
