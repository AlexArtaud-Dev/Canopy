package httpapi

import (
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
)

func TestCommandEntryNamesItsPlugin(t *testing.T) {
	builtin := toCommandEntry(commands.Entry{ID: "rsync.sync", Mode: commands.ModeBasic})
	if builtin.Plugin != nil {
		t.Fatal("built-in entries have no plugin")
	}
	fromPlugin := toCommandEntry(commands.Entry{
		ID: "tool.run", Mode: commands.ModeBasic,
		Plugin: &commands.PluginRef{ID: "tool", Name: commands.Text{En: "Tool", Fr: "Outil", Es: "Herramienta"}},
	})
	if fromPlugin.Plugin == nil || fromPlugin.Plugin.Id != "tool" || fromPlugin.Plugin.Name.Fr != "Outil" {
		t.Fatalf("plugin: %+v", fromPlugin.Plugin)
	}
}
