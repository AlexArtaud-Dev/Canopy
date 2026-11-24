package commands

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func text(value string) Text { return Text{En: value, Fr: value, Es: value} }

func viewEntries() []Entry {
	return []Entry{
		{ID: "jd.state"},
		{ID: "jd.pause"},
		{ID: "jd.enable", Params: []Param{{Name: "links", Type: TypeString}, {Name: "packages", Type: TypeString}}},
		{ID: "jd.rename", Params: []Param{{Name: "name", Type: TypeString}, {Name: "links", Type: TypeString}, {Name: "count", Type: TypeInt}}},
		{ID: "jd.needy", Params: []Param{{Name: "x", Type: TypeString, Required: true}}},
	}
}

func validView() PluginView {
	return PluginView{
		ID:      "downloads",
		Name:    text("Downloads"),
		Icon:    "download",
		Source:  "jd.state",
		Refresh: Duration{3 * time.Second},
		Widget:  true,
		Sections: []ViewSection{
			{Key: "downloads", Name: text("Downloads"), RowActions: []string{"enable"}},
			{Key: "grabber", Name: text("Grabber"), Empty: &Text{En: "None", Fr: "Aucun", Es: "Nada"}},
		},
		States: []ViewState{{Key: "running", Label: text("Running"), Tone: "active"}},
		Actions: []ViewAction{
			{ID: "pause", Name: text("Pause"), Icon: "pause", Command: "jd.pause", On: OnView},
			{ID: "enable", Name: text("Enable"), Icon: "check", Command: "jd.enable", On: OnRow, Groups: "packages", Items: "links"},
			{ID: "rename", Name: text("Rename"), Icon: "pencil", Command: "jd.rename", On: OnRow, Items: "links", Input: "name"},
		},
	}
}

func TestViewPermission(t *testing.T) {
	if got := ViewPermission("jdctl", "downloads"); got != "plugins:view.jdctl.downloads" {
		t.Fatalf("permission %q", got)
	}
}

func TestValidateViews(t *testing.T) {
	if err := ValidateViews([]PluginView{validView()}, viewEntries()); err != nil {
		t.Fatalf("valid view refused: %v", err)
	}
	if err := ValidateViews([]PluginView{validView(), validView()}, viewEntries()); err == nil {
		t.Fatal("a view declared twice")
	}
	cases := map[string]func(*PluginView){
		"id must be":                           func(v *PluginView) { v.ID = "Downloads" },
		"name needs":                           func(v *PluginView) { v.Name.Es = "" },
		"icon":                                 func(v *PluginView) { v.Icon = "rocket" },
		"source":                               func(v *PluginView) { v.Source = "jd.missing" },
		"must not need":                        func(v *PluginView) { v.Source = "jd.needy" },
		"refresh":                              func(v *PluginView) { v.Refresh = Duration{time.Second} },
		"at least one section":                 func(v *PluginView) { v.Sections = nil },
		"not allowed":                          func(v *PluginView) { v.Sections[0].Key = "summary" },
		"section \"downloads\" declared twice": func(v *PluginView) { v.Sections[1].Key = "downloads" },
		"texts need":                           func(v *PluginView) { v.Sections[1].Empty = &Text{En: "x"} },
		"not a row action":                     func(v *PluginView) { v.Sections[0].RowActions = []string{"pause"} },
		"unique key":                           func(v *PluginView) { v.States = append(v.States, v.States[0]) },
		"label needs":                          func(v *PluginView) { v.States[0].Label.Fr = "" },
		"tone":                                 func(v *PluginView) { v.States[0].Tone = "pink" },
		"action \"pause\" declared twice":      func(v *PluginView) { v.Actions = append(v.Actions, v.Actions[0]) },
		"lowercase":                            func(v *PluginView) { v.Actions[0].ID = "Pause" },
		"action \"pause\": name":               func(v *PluginView) { v.Actions[0].Name = Text{} },
		"action \"pause\": icon":               func(v *PluginView) { v.Actions[0].Icon = "nope" },
		"is not a command":                     func(v *PluginView) { v.Actions[0].Command = "jd.nope" },
		"on must be":                           func(v *PluginView) { v.Actions[0].On = "page" },
		"names the params":                     func(v *PluginView) { v.Actions[1].Groups, v.Actions[1].Items = "", "" },
		"takes no row ids":                     func(v *PluginView) { v.Actions[0].Items = "links" },
		"must be a string param":               func(v *PluginView) { v.Actions[2].Input = "count" },
		"string param of":                      func(v *PluginView) { v.Actions[2].Items = "missing" },
	}
	for want, change := range cases {
		view := validView()
		change(&view)
		err := ValidateViews([]PluginView{view}, viewEntries())
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: got %v", want, err)
		}
	}
}

func TestParseViewOutput(t *testing.T) {
	data, err := ParseViewOutput([]byte(" {\"version\":1,\"summary\":{\"active\":true}}\n"))
	if err != nil || data["version"] != float64(1) {
		t.Fatalf("object read: %v %v", data, err)
	}
	for _, output := range []string{"", "[]", "null", "nope", "42"} {
		if _, err := ParseViewOutput([]byte(output)); !errors.Is(err, ErrViewFailed) {
			t.Errorf("%q accepted", output)
		}
	}
	if _, err := ParseViewOutput(bytes.Repeat([]byte(" "), maxViewOutput+1)); !errors.Is(err, ErrViewFailed) {
		t.Error("oversized output accepted")
	}
}

func TestCappedWriter(t *testing.T) {
	var buffer bytes.Buffer
	writer := &cappedWriter{buffer: &buffer, limit: 4}
	n, _ := writer.Write([]byte("abc"))
	_, _ = writer.Write([]byte("def"))
	_, _ = writer.Write([]byte("ghi"))
	if n != 3 || buffer.String() != "abcd" {
		t.Fatalf("kept %q", buffer.String())
	}
}

func TestViewReaderFind(t *testing.T) {
	view := validView()
	entries := viewEntries()
	for i := range entries {
		entries[i].Binary = "jd"
		entries[i].Plugin = &PluginRef{ID: "jd", Views: []PluginView{view}}
	}
	available := NewAvailable(nil, func(string) (string, error) { return "/bin/jd", nil })
	located := make([]Located, 0, len(entries))
	for _, entry := range entries {
		located = append(located, Located{Entry: entry, Binary: "/plugins/jd/1.0.0/jd"})
	}
	available.SetPlugins(located)
	reader := ViewReader{Available: available}
	found, source, binary, ok := reader.Find("jd", "downloads")
	if !ok || found.ID != "downloads" || source.ID != "jd.state" || binary == "" {
		t.Fatalf("view not found: %v %v %q", found.ID, source.ID, binary)
	}
	if _, _, _, ok := reader.Find("jd", "nope"); ok {
		t.Error("unknown view found")
	}
	if _, err := reader.Read(context.Background(), "other", "downloads"); !errors.Is(err, ErrNoView) {
		t.Errorf("read of an unknown view: %v", err)
	}
}

func TestViewsUsing(t *testing.T) {
	plugin := &PluginRef{ID: "jd", Views: []PluginView{validView()}}
	if got := ViewsUsing(Entry{ID: "jd.pause", Plugin: plugin}); len(got) != 1 || got[0] != "downloads" {
		t.Fatalf("action: %v", got)
	}
	if got := ViewsUsing(Entry{ID: "jd.state", Plugin: plugin}); len(got) != 1 {
		t.Fatalf("source: %v", got)
	}
	if got := ViewsUsing(Entry{ID: "jd.connect", Plugin: plugin}); got != nil {
		t.Fatalf("unrelated: %v", got)
	}
	if ViewsUsing(Entry{ID: "rsync.sync"}) != nil {
		t.Fatal("built-in")
	}
}
