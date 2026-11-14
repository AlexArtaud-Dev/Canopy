package commands

import (
	"errors"
	"regexp"
	"strings"
	"testing"
)

const sample = `
- id: rsync.sync
  name: { en: Sync folders, fr: Synchroniser, es: Sincronizar }
  description: { en: Copy changes, fr: Copier, es: Copiar }
  binary: rsync
  mode: advanced
  params:
    - { name: source, type: path, access: read, required: true, label: { en: Source, fr: Source, es: Origen } }
    - { name: destination, type: path, access: create, required: true, label: { en: Target, fr: Cible, es: Destino } }
    - { name: deleteExtra, type: bool, default: false, flag: "--delete", label: { en: Delete, fr: Supprimer, es: Borrar } }
    - { name: bandwidth, type: int, min: 0, max: 100000, flag: "--bwlimit={value}", label: { en: Limit, fr: Limite, es: Límite } }
    - { name: token, type: string, secret: true, flag: "--password={value}", label: { en: Token, fr: Jeton, es: Token } }
    - { name: level, type: enum, values: [fast, best], label: { en: Level, fr: Niveau, es: Nivel } }
    - { name: suffix, type: string, pattern: "[a-z]+", label: { en: Suffix, fr: Suffixe, es: Sufijo } }
  args: ["-a", "--info=progress2", "{flags}", "--compress-level={level}", "{source}/", "{destination}/", "{suffix}"]
  progressParser: rsync-progress2
  dryRun: { flag: "--dry-run" }
  timeout: 24h
- id: tool.count
  name: { en: Count, fr: Compter, es: Contar }
  description: { en: x, fr: x, es: x }
  binary: wc
  mode: basic
  params: []
  args: ["-l"]
  progressParser: percent-regex
  progressPattern: '(?P<percent>\d+)%'
  timeout: 90s
`

func resolver(prefix string) Resolver {
	return func(_ Param, virtual string) (string, error) { return prefix + virtual, nil }
}

func TestParseAndBuild(t *testing.T) {
	entries, err := Parse([]byte(sample))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || entries[0].Timeout.Hours() != 24 {
		t.Fatalf("entries: %+v", entries)
	}
	plan, err := Build(entries[0], map[string]any{
		"source": "/media/a", "destination": "/backup", "deleteExtra": true,
		"bandwidth": float64(500), "token": "s3cret", "level": "best",
	}, resolver("/srv"), true)
	if err != nil {
		t.Fatal(err)
	}
	want := "--dry-run -a --info=progress2 --delete --bwlimit=500 --password=s3cret --compress-level=best /srv/media/a/ /srv/backup/"
	if got := strings.Join(plan.Argv, " "); got != want {
		t.Fatalf("argv:\n got %s\nwant %s", got, want)
	}
	if strings.Contains(strings.Join(plan.Preview, " "), "s3cret") || plan.Paths["source"] != "/media/a" {
		t.Fatalf("preview hides secrets: %v %v", plan.Preview, plan.Paths)
	}
	if Redact("auth s3cret ok", plan.Secrets) != "auth •••• ok" || Redact("x", []string{""}) != "x" {
		t.Fatal("redact")
	}
	// Defaults apply, optional args without a value are left out, no dry run.
	plan, err = Build(entries[0], map[string]any{"source": "/a", "destination": "/b", "suffix": "bak"}, resolver(""), false)
	if err != nil || strings.Join(plan.Argv, " ") != "-a --info=progress2 /a/ /b/ bak" {
		t.Fatalf("defaults: %v %v", plan.Argv, err)
	}
}

func TestBuildRefusals(t *testing.T) {
	entries, err := Parse([]byte(sample))
	if err != nil {
		t.Fatal(err)
	}
	base := func(extra map[string]any) map[string]any {
		values := map[string]any{"source": "/a", "destination": "/b"}
		for k, v := range extra {
			values[k] = v
		}
		return values
	}
	cases := []struct {
		name   string
		values map[string]any
		want   error
	}{
		{"unknown", base(map[string]any{"rm": true}), ErrUnknownParam},
		{"missing", map[string]any{"source": "/a"}, ErrMissing},
		{"bool type", base(map[string]any{"deleteExtra": "yes"}), ErrBadValue},
		{"int range", base(map[string]any{"bandwidth": float64(-1)}), ErrBadValue},
		{"int fraction", base(map[string]any{"bandwidth": 1.5}), ErrBadValue},
		{"int type", base(map[string]any{"bandwidth": "1"}), ErrBadValue},
		{"enum", base(map[string]any{"level": "max"}), ErrBadValue},
		{"enum type", base(map[string]any{"level": 3}), ErrBadValue},
		{"option injection", base(map[string]any{"suffix": "-rf"}), ErrBadValue},
		{"pattern", base(map[string]any{"suffix": "ABC"}), ErrBadValue},
		{"control", base(map[string]any{"token": "a\nb"}), ErrBadValue},
		{"empty", base(map[string]any{"token": ""}), ErrBadValue},
		{"not text", base(map[string]any{"token": 3}), ErrBadValue},
	}
	for _, tc := range cases {
		if _, err := Build(entries[0], tc.values, resolver(""), false); !errors.Is(err, tc.want) {
			t.Errorf("%s: %v, want %v", tc.name, err, tc.want)
		}
	}
	if _, err := Build(entries[1], nil, resolver(""), true); !errors.Is(err, ErrNoDryRun) {
		t.Fatalf("no dry run: %v", err)
	}
	denied := errors.New("denied")
	if _, err := Build(entries[0], base(nil), func(Param, string) (string, error) { return "", denied }, false); !errors.Is(err, denied) {
		t.Fatalf("resolver refusal: %v", err)
	}
	ints := Param{Name: "n", Type: TypeInt}
	for _, raw := range []any{3, int64(4)} {
		if _, err := ints.textOf(raw); err != nil {
			t.Fatalf("%T: %v", raw, err)
		}
	}
}

func TestParseRefusals(t *testing.T) {
	entry := func(change string) string {
		base := map[string]string{
			"id": "tool.run", "binary": "tool", "mode": "basic", "parser": "none", "timeout": "1m",
			"args": `["{x}"]`, "params": `[{ name: x, type: string, label: { en: X, fr: X, es: X } }]`,
			"pattern": "",
		}
		key, value, _ := strings.Cut(change, "=")
		base[key] = value
		return `- id: ` + base["id"] + `
  name: { en: A, fr: B, es: C }
  description: { en: A, fr: B, es: C }
  binary: ` + base["binary"] + `
  mode: ` + base["mode"] + `
  params: ` + base["params"] + `
  args: ` + base["args"] + `
  progressParser: ` + base["parser"] + `
  progressPattern: '` + base["pattern"] + `'
  timeout: ` + base["timeout"] + "\n"
	}
	if _, err := Parse([]byte(entry(""))); err != nil {
		t.Fatalf("valid: %v", err)
	}
	bad := []string{
		"id=tool", "binary=/bin/rm", "mode=root", "timeout=0s", "timeout=900h", "timeout=soon", "parser=magic",
		"parser=percent-regex", "args=[]", `args=["{y}"]`, `args=["-x{flags}"]`,
		`params=[{ name: x, type: blob, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: flags, type: string, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, label: { en: X } }]`,
		`params=[{ name: x, type: path, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, access: read, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: enum, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: bool, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: int, flag: "--n", label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, pattern: "(", label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, label: { en: X, fr: X, es: X } }, { name: x, type: string, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: bool, flag: "--x", label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, unknown: 1, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, choices: [{ value: a, label: { en: A, fr: A, es: A } }], label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: enum, values: [a], choices: [{ value: a, label: { en: A, fr: A, es: A } }], label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: enum, choices: [{ value: a, label: { en: A } }], label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, on: file, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: int, choicesFrom: tool.list, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, choicesFrom: tool.missing, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, choicesFrom: tool.run, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: path, access: read, on: disk, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: path, access: read, extensions: [mkv], label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: path, access: read, on: folder, extensions: [mkv], label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: path, access: read, on: file, extensions: [".MKV"], label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, required: true, advanced: true, label: { en: X, fr: X, es: X } }]`,
		`params=[{ name: x, type: string, help: { en: Why }, label: { en: X, fr: X, es: X } }]`,
	}
	folded := entry(`params=[{ name: x, type: int, required: true, default: 3, advanced: true, help: { en: H, fr: H, es: H }, label: { en: X, fr: X, es: X } }]`) + "  secondary: true\n"
	if entries, err := Parse([]byte(folded)); err != nil || !entries[0].Secondary || !entries[0].Params[0].Advanced || entries[0].Params[0].Help.Fr != "H" {
		t.Fatalf("advanced, help and secondary: %v %v", entries, err)
	}
	lister := entry(`id=tool.list`) + entry(`params=[{ name: x, type: string, choicesFrom: tool.list, label: { en: X, fr: X, es: X } }]`)
	if entries, err := Parse([]byte(lister)); err != nil || entries[1].Params[0].ChoicesFrom != "tool.list" {
		t.Fatalf("choices from a command: %v %v", entries, err)
	}
	targeted := entry(`params=[{ name: x, type: path, access: read, on: file, extensions: [mkv, mp4], label: { en: X, fr: X, es: X } }]`)
	if entries, err := Parse([]byte(targeted)); err != nil || entries[0].Params[0].On != OnFile || len(entries[0].Params[0].Extensions) != 2 {
		t.Fatalf("file target: %v %v", entries, err)
	}
	if _, err := Parse([]byte(entry(`params=[{ name: x, type: path, access: update, on: folder, label: { en: X, fr: X, es: X } }]`))); err != nil {
		t.Fatalf("folder target: %v", err)
	}
	labelled := entry(`params=[{ name: x, type: enum, choices: [{ value: s, label: { en: Skip, fr: Ignorer, es: Omitir } }], label: { en: X, fr: X, es: X } }]`)
	if entries, err := Parse([]byte(labelled)); err != nil || entries[0].Params[0].Values[0] != "s" {
		t.Fatalf("choices: %v %v", entries, err)
	}
	for _, change := range bad {
		if _, err := Parse([]byte(entry(change))); !errors.Is(err, ErrCatalog) {
			t.Errorf("%s accepted", change)
		}
	}
	twice := entry("") + entry("")
	if _, err := Parse([]byte(twice)); !errors.Is(err, ErrCatalog) {
		t.Fatal("duplicate ids")
	}
	noFlags := `- id: tool.run
  name: { en: A, fr: B, es: C }
  description: { en: A, fr: B, es: C }
  binary: tool
  mode: basic
  params: [{ name: x, type: bool, flag: "--x", label: { en: X, fr: X, es: X } }]
  args: ["run"]
  progressParser: none
  timeout: 1m
`
	if _, err := Parse([]byte(noFlags)); !errors.Is(err, ErrCatalog) {
		t.Fatal("flags without {flags}")
	}
}

func TestParsers(t *testing.T) {
	entries, _ := Parse([]byte(sample))
	rsync := NewParser(entries[0])
	reading := rsync.Read("     1,234,567  45%   12.34MB/s    0:00:12 (xfr#3, to-chk=7/10)")
	if reading.Percent == nil || *reading.Percent != 45 || *reading.Bytes != 1234567 {
		t.Fatalf("rsync: %+v", reading)
	}
	if rsync.Read("sending incremental file list").Percent != nil {
		t.Fatal("rsync other line")
	}
	if rsync.Read("99999999999999999999 10% x").Bytes != nil {
		t.Fatal("rsync overflow")
	}
	percent := NewParser(entries[1])
	if got := percent.Read("done 73% now"); got.Percent == nil || *got.Percent != 73 {
		t.Fatalf("regex: %+v", got)
	}
	if percent.Read("nothing").Percent != nil || percent.Read("150%").Percent != nil {
		t.Fatal("regex misses")
	}
	if got := percent.Read("done 73% now"); got.Detail != nil {
		t.Fatalf("no detail group, no detail: %+v", got)
	}
	detailed := NewParser(Entry{ProgressParser: ParserPercentRegex, progress: regexp.MustCompile(`^(?P<percent>\d+)% (?P<detail>.*)$`)})
	if got := detailed.Read("42% 0:04:11 / 0:09:56 playing vol 18 "); got.Detail == nil || *got.Detail != "0:04:11 / 0:09:56 playing vol 18" {
		t.Fatalf("detail: %+v", got)
	}
	if got := detailed.Read("1% " + strings.Repeat("x", 500)); len(*got.Detail) != maxDetail {
		t.Fatalf("detail bounded: %d", len(*got.Detail))
	}
	counter := NewParser(Entry{ProgressParser: ParserLineCount})
	counter.Read("a")
	counter.Read("  ")
	if got := counter.Read("b"); *got.Items != 2 {
		t.Fatalf("lines: %+v", got)
	}
	if NewParser(Entry{}).Read("x").Percent != nil {
		t.Fatal("none")
	}
}
