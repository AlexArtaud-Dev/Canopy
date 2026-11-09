package commands

import (
	"errors"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"
)

// Refusals of a run request (codes translated by the web app).
var (
	ErrUnknownParam = errors.New("unknown parameter")
	ErrMissing      = errors.New("missing parameter")
	ErrBadValue     = errors.New("invalid parameter value")
	ErrNoDryRun     = errors.New("this command has no dry run")
)

// Error codes.
const (
	CodeUnknownParam = "commands.unknown_param"
	CodeMissing      = "commands.missing_param"
	CodeBadValue     = "commands.invalid_value"
	CodeNoDryRun     = "commands.no_dry_run"
)

// maxStringLength bounds free text values.
const maxStringLength = 1024

// redacted replaces secret values in previews and logs.
const redacted = "••••"

// Resolver maps a path parameter's virtual path to the host path given to the tool, after
// checking the person's right (the param's access) on it.
type Resolver func(param Param, virtual string) (string, error)

// Plan is a validated run: the exact argument list, the same with secrets hidden (shown to the
// person and logged), the virtual paths used, and the secret values to scrub from output.
type Plan struct {
	Argv    []string
	Preview []string
	Paths   map[string]string
	Secrets []string
}

// Build validates the values against the entry and expands its template. Each template item
// gives at most one argument; values are never split or interpreted by a shell.
func Build(entry Entry, values map[string]any, resolve Resolver, dryRun bool) (Plan, error) {
	if dryRun && entry.DryRun == nil {
		return Plan{}, ErrNoDryRun
	}
	for name := range values {
		if !slices.ContainsFunc(entry.Params, func(p Param) bool { return p.Name == name }) {
			return Plan{}, fmt.Errorf("%w: %s", ErrUnknownParam, name)
		}
	}
	plan := Plan{Paths: map[string]string{}}
	resolved := map[string]string{}
	for _, param := range entry.Params {
		raw, given := values[param.Name]
		if !given || raw == nil {
			raw, given = param.Default, param.Default != nil
		}
		if !given {
			if param.Required {
				return Plan{}, fmt.Errorf("%w: %s", ErrMissing, param.Name)
			}
			continue
		}
		text, err := param.textOf(raw)
		if err != nil {
			return Plan{}, fmt.Errorf("%w: %s: %w", ErrBadValue, param.Name, err)
		}
		if param.Type == TypePath {
			plan.Paths[param.Name] = text
			if text, err = resolve(param, text); err != nil {
				return Plan{}, err
			}
		}
		if param.Secret {
			plan.Secrets = append(plan.Secrets, text)
		}
		resolved[param.Name] = text
	}
	plan.Argv, plan.Preview = expand(entry, resolved)
	if dryRun {
		plan.Argv = append([]string{entry.DryRun.Flag}, plan.Argv...)
		plan.Preview = append([]string{entry.DryRun.Flag}, plan.Preview...)
	}
	return plan, nil
}

// textOf checks one value against its param and returns it as it goes into an argument.
func (p Param) textOf(raw any) (string, error) {
	switch p.Type {
	case TypeBool:
		value, ok := raw.(bool)
		if !ok {
			return "", errors.New("not a boolean")
		}
		return strconv.FormatBool(value), nil
	case TypeInt:
		return p.intText(raw)
	case TypeEnum:
		value, ok := raw.(string)
		if !ok || !slices.Contains(p.Values, value) {
			return "", errors.New("not one of the choices")
		}
		return value, nil
	default:
		return p.stringText(raw)
	}
}

func (p Param) intText(raw any) (string, error) {
	var value int64
	switch number := raw.(type) {
	case int:
		value = int64(number)
	case int64:
		value = number
	case float64:
		if number != math.Trunc(number) || math.Abs(number) > 1<<53 {
			return "", errors.New("not a whole number")
		}
		value = int64(number)
	default:
		return "", errors.New("not a number")
	}
	if (p.Min != nil && value < *p.Min) || (p.Max != nil && value > *p.Max) {
		return "", errors.New("out of range")
	}
	return strconv.FormatInt(value, 10), nil
}

func (p Param) stringText(raw any) (string, error) {
	value, ok := raw.(string)
	switch {
	case !ok:
		return "", errors.New("not text")
	case value == "" || len(value) > maxStringLength:
		return "", errors.New("empty or too long")
	case strings.ContainsFunc(value, func(r rune) bool { return r < 0x20 || r == 0x7f }):
		return "", errors.New("control characters")
	// A positional value starting with "-" would be read as an option by most tools.
	case p.Type == TypeString && strings.HasPrefix(value, "-"):
		return "", errors.New("cannot start with -")
	case p.pattern != nil && !p.pattern.MatchString(value):
		return "", errors.New("does not match the expected format")
	}
	return value, nil
}

// expand fills the template. An argument whose placeholders lack a value is left out; {flags}
// gives the flags of set params, in declaration order.
func expand(entry Entry, values map[string]string) ([]string, []string) {
	secret := map[string]bool{}
	for _, param := range entry.Params {
		secret[param.Name] = param.Secret
	}
	fill := func(template string, hide bool) (string, bool) {
		complete := true
		out := placeholder.ReplaceAllStringFunc(template, func(match string) string {
			name := match[1 : len(match)-1]
			value, ok := values[name]
			if !ok {
				complete = false
				return ""
			}
			if hide && secret[name] {
				return redacted
			}
			return value
		})
		return out, complete
	}
	var argv, preview []string
	for _, template := range entry.Args {
		if template == "{flags}" {
			flags, shown := flagsOf(entry.Params, values, secret)
			argv, preview = append(argv, flags...), append(preview, shown...)
			continue
		}
		arg, complete := fill(template, false)
		if !complete {
			continue
		}
		shown, _ := fill(template, true)
		argv, preview = append(argv, arg), append(preview, shown)
	}
	return argv, preview
}

func flagsOf(params []Param, values map[string]string, secret map[string]bool) ([]string, []string) {
	var flags, shown []string
	for _, param := range params {
		value, ok := values[param.Name]
		if !ok || param.Flag == "" {
			continue
		}
		if param.Type == TypeBool {
			if value == "true" {
				flags, shown = append(flags, param.Flag), append(shown, param.Flag)
			}
			continue
		}
		flags = append(flags, strings.ReplaceAll(param.Flag, "{value}", value))
		visible := value
		if secret[param.Name] {
			visible = redacted
		}
		shown = append(shown, strings.ReplaceAll(param.Flag, "{value}", visible))
	}
	return flags, shown
}

// Redact hides secret values in one line of output.
func Redact(line string, secrets []string) string {
	for _, secret := range secrets {
		if secret != "" {
			line = strings.ReplaceAll(line, secret, redacted)
		}
	}
	return line
}
