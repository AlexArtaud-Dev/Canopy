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
	targeted := toCommandEntry(commands.Entry{ID: "tool.play", Mode: commands.ModeBasic, Params: []commands.Param{
		{Name: "video", Type: commands.TypePath, Access: commands.AccessRead, On: commands.OnFile, Extensions: []string{"mkv"}},
		{Name: "folder", Type: commands.TypePath, Access: commands.AccessRead},
	}})
	if video := targeted.Params[0]; video.On == nil || *video.On != "file" || video.Extensions == nil || (*video.Extensions)[0] != "mkv" {
		t.Fatalf("file target: %+v", video)
	}
	if folder := targeted.Params[1]; folder.On != nil || folder.Extensions != nil {
		t.Fatalf("no target: %+v", folder)
	}
	if fromPlugin.Plugin == nil || fromPlugin.Plugin.Id != "tool" || fromPlugin.Plugin.Name.Fr != "Outil" {
		t.Fatalf("plugin: %+v", fromPlugin.Plugin)
	}
}
