package commands

import (
	"errors"
	"fmt"
	"regexp"
	"slices"
	"time"
)

// PluginView is a live page a plugin brings (downloads, a queue): Canopy runs its source command
// every few seconds, shows the JSON it prints (sections of rows, a summary) and offers the
// plugin's commands as actions on the view or on chosen rows.
type PluginView struct {
	ID   string `yaml:"id"`
	Name Text   `yaml:"name"`
	// Icon is one of ViewIcons.
	Icon string `yaml:"icon"`
	// Source names the plugin command printing the view's JSON; it takes no required param.
	Source  string   `yaml:"source"`
	Refresh Duration `yaml:"refresh"`
	// Widget shows a summary in the page header while the view says it is active.
	Widget   bool          `yaml:"widget,omitempty"`
	Sections []ViewSection `yaml:"sections"`
	States   []ViewState   `yaml:"states,omitempty"`
	Actions  []ViewAction  `yaml:"actions,omitempty"`
}

// ViewSection is one list of the view's JSON (`"downloads": [...]`).
type ViewSection struct {
	Key   string `yaml:"key"`
	Name  Text   `yaml:"name"`
	Empty *Text  `yaml:"empty,omitempty"`
	// RowActions are the ids of the row actions offered on this section's rows.
	RowActions []string `yaml:"rowActions,omitempty"`
}

// ViewState names a row state the JSON uses and how it looks.
type ViewState struct {
	Key   string `yaml:"key"`
	Label Text   `yaml:"label"`
	// Tone is one of ViewTones.
	Tone string `yaml:"tone"`
}

// ViewAction runs a plugin command from the view: on the whole view, or on chosen rows whose ids
// go, comma separated, into the command's Groups and Items params. Input names a text param the
// person types (a new name, links to add).
type ViewAction struct {
	ID      string `yaml:"id"`
	Name    Text   `yaml:"name"`
	Icon    string `yaml:"icon"`
	Command string `yaml:"command"`
	On      string `yaml:"on"`
	Confirm bool   `yaml:"confirm,omitempty"`
	Groups  string `yaml:"groups,omitempty"`
	Items   string `yaml:"items,omitempty"`
	Input   string `yaml:"input,omitempty"`
}

// Where a view action applies.
const (
	OnView = "view"
	OnRow  = "row"
)

// ViewIcons are the icons a view or an action may use (the web app draws them).
var ViewIcons = []string{
	"activity", "arrow-down", "arrow-up", "check", "cloud", "download", "eye", "eye-off", "flag",
	"folder", "link", "list", "pause", "pencil", "play", "plus", "power", "refresh", "rotate-ccw",
	"server", "square", "trash", "upload", "x", "zap",
}

// ViewTones are how a row state may look.
var ViewTones = []string{"active", "success", "warning", "danger", "muted"}

var (
	viewID     = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)
	sectionKey = regexp.MustCompile(`^[a-z][a-zA-Z0-9_]{0,31}$`)
)

const (
	minRefresh = 2 * time.Second
	maxRefresh = time.Minute
)

// ViewPermission is the global permission reading a view and running its actions needs.
func ViewPermission(pluginID, viewID string) string {
	return "plugins:view." + pluginID + "." + viewID
}

func complete(text Text) bool { return text.En != "" && text.Fr != "" && text.Es != "" }

// ValidateViews checks a plugin's views against its commands (by id).
func ValidateViews(views []PluginView, entries []Entry) error {
	byID := map[string]Entry{}
	for _, entry := range entries {
		byID[entry.ID] = entry
	}
	seen := map[string]bool{}
	for _, view := range views {
		if err := view.validate(byID); err != nil {
			return fmt.Errorf("view %q: %w", view.ID, err)
		}
		if seen[view.ID] {
			return fmt.Errorf("view %q declared twice", view.ID)
		}
		seen[view.ID] = true
	}
	return nil
}

func (v PluginView) validate(byID map[string]Entry) error {
	source, ok := byID[v.Source]
	switch {
	case !viewID.MatchString(v.ID):
		return errors.New("id must be lowercase letters, digits and dashes")
	case !complete(v.Name):
		return errors.New("name needs en, fr and es")
	case !slices.Contains(ViewIcons, v.Icon):
		return fmt.Errorf("icon %q is not one of the view icons", v.Icon)
	case !ok:
		return fmt.Errorf("source %q is not a command of this plugin", v.Source)
	case slices.ContainsFunc(source.Params, func(param Param) bool { return param.Required && param.Default == nil }):
		return fmt.Errorf("source %q must not need a param", v.Source)
	case v.Refresh.Duration < minRefresh || v.Refresh.Duration > maxRefresh:
		return errors.New("refresh must be between 2s and 1m")
	case len(v.Sections) == 0:
		return errors.New("a view shows at least one section")
	}
	actions := map[string]ViewAction{}
	for _, action := range v.Actions {
		if err := action.validate(byID); err != nil {
			return fmt.Errorf("action %q: %w", action.ID, err)
		}
		if _, twice := actions[action.ID]; twice {
			return fmt.Errorf("action %q declared twice", action.ID)
		}
		actions[action.ID] = action
	}
	if err := validateSections(v.Sections, actions); err != nil {
		return err
	}
	return validateStates(v.States)
}

func validateSections(sections []ViewSection, actions map[string]ViewAction) error {
	keys := map[string]bool{}
	for _, section := range sections {
		switch {
		case !sectionKey.MatchString(section.Key) || section.Key == "version" || section.Key == "summary":
			return fmt.Errorf("section key %q is not allowed", section.Key)
		case keys[section.Key]:
			return fmt.Errorf("section %q declared twice", section.Key)
		case !complete(section.Name) || (section.Empty != nil && !complete(*section.Empty)):
			return fmt.Errorf("section %q: texts need en, fr and es", section.Key)
		}
		for _, id := range section.RowActions {
			if action, ok := actions[id]; !ok || action.On != OnRow {
				return fmt.Errorf("section %q: %q is not a row action of this view", section.Key, id)
			}
		}
		keys[section.Key] = true
	}
	return nil
}

func validateStates(states []ViewState) error {
	keys := map[string]bool{}
	for _, state := range states {
		switch {
		case !sectionKey.MatchString(state.Key) || keys[state.Key]:
			return fmt.Errorf("state %q is not a unique key", state.Key)
		case !complete(state.Label):
			return fmt.Errorf("state %q: label needs en, fr and es", state.Key)
		case !slices.Contains(ViewTones, state.Tone):
			return fmt.Errorf("state %q: tone %q is not one of the view tones", state.Key, state.Tone)
		}
		keys[state.Key] = true
	}
	return nil
}

func (a ViewAction) validate(byID map[string]Entry) error {
	entry, ok := byID[a.Command]
	switch {
	case !viewID.MatchString(a.ID):
		return errors.New("id must be lowercase letters, digits and dashes")
	case !complete(a.Name):
		return errors.New("name needs en, fr and es")
	case !slices.Contains(ViewIcons, a.Icon):
		return fmt.Errorf("icon %q is not one of the view icons", a.Icon)
	case !ok:
		return fmt.Errorf("command %q is not a command of this plugin", a.Command)
	case a.On != OnView && a.On != OnRow:
		return errors.New(`on must be "view" or "row"`)
	case a.On == OnRow && a.Groups == "" && a.Items == "":
		return errors.New("a row action names the params taking group or item ids")
	case a.On == OnView && (a.Groups != "" || a.Items != ""):
		return errors.New("a view action takes no row ids")
	}
	for _, name := range []string{a.Groups, a.Items, a.Input} {
		if name == "" {
			continue
		}
		index := slices.IndexFunc(entry.Params, func(param Param) bool { return param.Name == name })
		if index < 0 || entry.Params[index].Type != TypeString {
			return fmt.Errorf("param %q must be a string param of %q", name, a.Command)
		}
	}
	return nil
}

// ViewsUsing lists the views of the entry's plugin that run it (as their source or an action):
// running such a command needs one of their permissions.
func ViewsUsing(entry Entry) []string {
	if entry.Plugin == nil {
		return nil
	}
	var ids []string
	for _, view := range entry.Plugin.Views {
		uses := view.Source == entry.ID ||
			slices.ContainsFunc(view.Actions, func(action ViewAction) bool { return action.Command == entry.ID })
		if uses {
			ids = append(ids, view.ID)
		}
	}
	return ids
}
