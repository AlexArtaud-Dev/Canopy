// Package commands runs external tools from a catalog of predefined entries. People never type a
// command: they pick an entry and fill typed parameters; the engine builds the argument list from
// the entry's template (one template item is one argument, never split by a shell) and runs it
// without a shell.
package commands

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"go.yaml.in/yaml/v3"
)

// Param types.
const (
	TypePath   = "path"
	TypeBool   = "bool"
	TypeInt    = "int"
	TypeString = "string"
	TypeEnum   = "enum"
)

// Path access: the path action a person needs on a path parameter.
const (
	AccessRead   = "read"
	AccessCreate = "create"
	AccessUpdate = "update"
)

// What a path param works on.
const (
	OnFile   = "file"
	OnFolder = "folder"
)

// Modes: basic entries are offered to everyone who may run commands, advanced ones only in
// advanced mode.
const (
	ModeBasic    = "basic"
	ModeAdvanced = "advanced"
)

// Progress parsers.
const (
	ParserNone           = "none"
	ParserRsyncProgress2 = "rsync-progress2"
	ParserPercentRegex   = "percent-regex"
	ParserLineCount      = "line-count"
)

// Text is a label in the three languages Canopy ships in.
type Text struct {
	En string `yaml:"en"`
	Fr string `yaml:"fr"`
	Es string `yaml:"es"`
}

// Param is one typed input of an entry.
type Param struct {
	Name   string `yaml:"name"`
	Type   string `yaml:"type"`
	Label  Text   `yaml:"label"`
	Access string `yaml:"access,omitempty"`
	// On tells what a path param works on ("file" or "folder"), so that the file browser offers
	// the command on the right entries; Extensions narrows files (lower case, without dot).
	On         string   `yaml:"on,omitempty"`
	Extensions []string `yaml:"extensions,omitempty"`
	Required   bool     `yaml:"required,omitempty"`
	Default    any      `yaml:"default,omitempty"`
	Min        *int64   `yaml:"min,omitempty"`
	Max        *int64   `yaml:"max,omitempty"`
	Values     []string `yaml:"values,omitempty"`
	// Choices name enum values in the three languages; they replace Values when given.
	Choices []Choice `yaml:"choices,omitempty"`
	Pattern string   `yaml:"pattern,omitempty"`
	// Flag is how the value appears in {flags}: "--delete" for a bool, "--bwlimit={value}" else.
	Flag string `yaml:"flag,omitempty"`
	// Secret values never appear in previews or logs.
	Secret bool `yaml:"secret,omitempty"`

	pattern *regexp.Regexp
}

// Choice is one value of an enum param with its label.
type Choice struct {
	Value string `yaml:"value"`
	Label Text   `yaml:"label"`
}

// Entry is one catalog command.
type Entry struct {
	ID          string   `yaml:"id"`
	Name        Text     `yaml:"name"`
	Description Text     `yaml:"description"`
	Binary      string   `yaml:"binary"`
	Mode        string   `yaml:"mode"`
	Params      []Param  `yaml:"params"`
	Args        []string `yaml:"args"`
	// ProgressParser turns output lines into progress; ProgressPattern is the percent-regex.
	ProgressParser  string   `yaml:"progressParser"`
	ProgressPattern string   `yaml:"progressPattern,omitempty"`
	DryRun          *DryRun  `yaml:"dryRun,omitempty"`
	Timeout         Duration `yaml:"timeout"`
	// Plugin is set by the engine for entries a plugin brings; never read from a file.
	Plugin *PluginRef `yaml:"-"`

	progress *regexp.Regexp
}

// PluginRef names the plugin an entry comes from, so the file browser can group commands.
type PluginRef struct {
	ID   string
	Name Text
}

// DryRun says how the tool simulates a run.
type DryRun struct {
	Flag string `yaml:"flag"`
}

// Duration reads "90s", "2h" or "24h".
type Duration struct{ time.Duration }

// UnmarshalYAML implements yaml.Unmarshaler.
func (d *Duration) UnmarshalYAML(node *yaml.Node) error {
	parsed, err := time.ParseDuration(node.Value)
	if err != nil {
		return fmt.Errorf("duration %q: %w", node.Value, err)
	}
	d.Duration = parsed
	return nil
}

// ErrCatalog is wrapped by every problem found in a catalog file.
var ErrCatalog = errors.New("invalid command catalog")

var (
	idPattern        = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$`)
	namePattern      = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9]{0,39}$`)
	binaryPattern    = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)
	placeholder      = regexp.MustCompile(`\{([a-zA-Z][a-zA-Z0-9]*)\}`)
	maxTimeout       = 7 * 24 * time.Hour
	paramTypes       = []string{TypePath, TypeBool, TypeInt, TypeString, TypeEnum}
	pathAccesses     = []string{AccessRead, AccessCreate, AccessUpdate}
	pathTargets      = []string{OnFile, OnFolder}
	extensionPattern = regexp.MustCompile(`^[a-z0-9]{1,10}$`)
	progressParsers  = []string{ParserNone, ParserRsyncProgress2, ParserPercentRegex, ParserLineCount}
)

// Parse reads a catalog file (a YAML list of entries). Unknown fields are refused, and every
// entry is checked so that nothing malformed ever reaches the runner.
func Parse(data []byte) ([]Entry, error) {
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	var entries []Entry
	if err := decoder.Decode(&entries); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrCatalog, err)
	}
	if err := Validate(entries); err != nil {
		return nil, err
	}
	return entries, nil
}

// Validate checks decoded entries (a catalog file, or a plugin's commands) and prepares their
// patterns. Ids must be unique.
func Validate(entries []Entry) error {
	seen := map[string]bool{}
	for i := range entries {
		if err := entries[i].validate(); err != nil {
			return fmt.Errorf("%w: entry %q: %w", ErrCatalog, entries[i].ID, err)
		}
		if seen[entries[i].ID] {
			return fmt.Errorf("%w: duplicate entry %q", ErrCatalog, entries[i].ID)
		}
		seen[entries[i].ID] = true
	}
	return nil
}

func (e *Entry) validate() error {
	switch {
	case !idPattern.MatchString(e.ID):
		return errors.New("id must look like tool.action")
	case !binaryPattern.MatchString(e.Binary):
		return errors.New("binary must be a bare program name")
	case e.Mode != ModeBasic && e.Mode != ModeAdvanced:
		return errors.New("mode must be basic or advanced")
	case e.Name.En == "" || e.Name.Fr == "" || e.Name.Es == "":
		return errors.New("name needs en, fr and es")
	case len(e.Args) == 0:
		return errors.New("args are empty")
	case e.Timeout.Duration <= 0 || e.Timeout.Duration > maxTimeout:
		return errors.New("timeout must be between 1s and 7 days")
	case !slices.Contains(progressParsers, e.ProgressParser):
		return fmt.Errorf("unknown progress parser %q", e.ProgressParser)
	}
	if e.ProgressParser == ParserPercentRegex {
		compiled, err := regexp.Compile(e.ProgressPattern)
		if err != nil || !slices.Contains(compiled.SubexpNames(), "percent") {
			return errors.New("progressPattern needs a (?P<percent>…) group")
		}
		e.progress = compiled
	}
	names := map[string]bool{"flags": true}
	for i := range e.Params {
		if err := e.Params[i].validate(); err != nil {
			return fmt.Errorf("param %q: %w", e.Params[i].Name, err)
		}
		if names[e.Params[i].Name] {
			return fmt.Errorf("param %q declared twice", e.Params[i].Name)
		}
		names[e.Params[i].Name] = true
	}
	flagged := map[string]bool{}
	for _, param := range e.Params {
		flagged[param.Name] = param.Flag != ""
	}
	if slices.ContainsFunc(e.Params, func(p Param) bool { return p.Flag != "" }) && !slices.Contains(e.Args, "{flags}") {
		return errors.New("params with a flag need {flags} in args")
	}
	for _, arg := range e.Args {
		for _, match := range placeholder.FindAllStringSubmatch(arg, -1) {
			if !names[match[1]] {
				return fmt.Errorf("args use unknown {%s}", match[1])
			}
			if flagged[match[1]] {
				return fmt.Errorf("{%s} has a flag: it goes through {flags} only", match[1])
			}
		}
		if strings.Contains(arg, "{flags}") && arg != "{flags}" {
			return errors.New("{flags} must be an argument of its own")
		}
	}
	return nil
}

func (p *Param) validate() error {
	if err := p.takeChoices(); err != nil {
		return err
	}
	switch {
	case !namePattern.MatchString(p.Name) || p.Name == "flags" || p.Name == "value":
		return errors.New("invalid name")
	case !slices.Contains(paramTypes, p.Type):
		return fmt.Errorf("unknown type %q", p.Type)
	case p.Label.En == "" || p.Label.Fr == "" || p.Label.Es == "":
		return errors.New("label needs en, fr and es")
	case p.Type == TypePath && !slices.Contains(pathAccesses, p.Access):
		return errors.New("path params need access read, create or update")
	case p.Type != TypePath && p.Access != "":
		return errors.New("only path params have an access")
	case p.On != "" && (p.Type != TypePath || !slices.Contains(pathTargets, p.On)):
		return errors.New("on is file or folder, for path params")
	case len(p.Extensions) > 0 && p.On != OnFile:
		return errors.New("extensions need on: file")
	case slices.ContainsFunc(p.Extensions, func(extension string) bool { return !extensionPattern.MatchString(extension) }):
		return errors.New("extensions are lower-case letters and digits, without dot")
	case p.Type == TypeEnum && len(p.Values) == 0:
		return errors.New("enum params need values")
	case p.Type == TypeBool && p.Flag == "":
		return errors.New("bool params need a flag")
	case p.Flag != "" && p.Type != TypeBool && !strings.Contains(p.Flag, "{value}"):
		return errors.New("a valued flag needs {value}")
	}
	if p.Pattern != "" {
		compiled, err := regexp.Compile("^(?:" + p.Pattern + ")$")
		if err != nil {
			return fmt.Errorf("pattern: %w", err)
		}
		p.pattern = compiled
	}
	return nil
}

// takeChoices turns labelled choices into the enum's values.
func (p *Param) takeChoices() error {
	if len(p.Choices) == 0 {
		return nil
	}
	if p.Type != TypeEnum || len(p.Values) > 0 {
		return errors.New("choices are for enum params, instead of values")
	}
	for _, choice := range p.Choices {
		if choice.Value == "" || choice.Label.En == "" || choice.Label.Fr == "" || choice.Label.Es == "" {
			return errors.New("each choice needs a value and en, fr and es labels")
		}
		p.Values = append(p.Values, choice.Value)
	}
	return nil
}
