package httpapi

import (
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
)

func TestCommandEntryNamesItsPlugin(t *testing.T) {
	builtin := toCommandEntry(commands.Entry{ID: "rsync.sync", Mode: commands.ModeBasic})
	if builtin.Plugin != nil {
		t.Fatal("built-in entries have no plugin")
	}
	fromPlugin := toCommandEntry(commands.Entry{
		ID: "tool.run", Mode: commands.ModeBasic,
		Plugin: &commands.PluginRef{ID: "tool", Name: commands.Text{En: "Tool", Fr: "Outil", Es: "Herramienta"}, Devices: []commands.DeviceKind{
			{Kind: "screen", Name: commands.Text{En: "Screens", Fr: "Écrans", Es: "Pantallas"}, Detect: "tool.list", Pair: &commands.DevicePairing{Start: "tool.pair", Code: "tool.code"}, Controls: &commands.DeviceControls{Pause: "tool.pause", Resume: "tool.resume", Stop: "tool.stop", Seek: "tool.seek"}},
			{Kind: "speaker", Detect: "tool.speakers"},
		}},
		Params: []commands.Param{{Name: "screen", Type: commands.TypeString, Device: "screen"}},
	})
	if devices := fromPlugin.Plugin.Devices; devices == nil || len(*devices) != 2 || (*devices)[0].Pair == nil || (*devices)[0].Pair.Code != "tool.code" || (*devices)[1].Pair != nil {
		t.Fatalf("devices: %+v", fromPlugin.Plugin.Devices)
	}
	if controls := (*fromPlugin.Plugin.Devices)[0].Controls; controls == nil || controls.Seek == nil || *controls.Seek != "tool.seek" || controls.Volume != nil || (*fromPlugin.Plugin.Devices)[1].Controls != nil {
		t.Fatalf("controls: %+v", controls)
	}
	if device := fromPlugin.Params[0].Device; device == nil || *device != "screen" {
		t.Fatalf("device param: %+v", fromPlugin.Params[0])
	}
	if toCommandEntry(commands.Entry{ID: "x.y", Plugin: &commands.PluginRef{ID: "x"}}).Plugin.Devices != nil {
		t.Fatal("no devices declared: none listed")
	}
	targeted := toCommandEntry(commands.Entry{ID: "tool.play", Mode: commands.ModeBasic, Params: []commands.Param{
		{Name: "video", Type: commands.TypePath, Access: commands.AccessRead, On: commands.OnFile, Extensions: []string{"mkv"}},
		{Name: "folder", Type: commands.TypePath, Access: commands.AccessRead},
		{Name: "device", Type: commands.TypeString, ChoicesFrom: "tool.devices"},
		{Name: "port", Type: commands.TypeInt, Advanced: true, Help: &commands.Text{En: "Port", Fr: "Port", Es: "Puerto"}},
	}, Secondary: true})
	if port := targeted.Params[3]; port.Advanced == nil || !*port.Advanced || port.Help == nil || port.Help.Es != "Puerto" {
		t.Fatalf("advanced and help: %+v", port)
	}
	if targeted.Secondary == nil || !*targeted.Secondary || builtin.Secondary != nil || targeted.Params[0].Advanced != nil || targeted.Params[0].Help != nil {
		t.Fatalf("secondary: %+v", targeted)
	}
	if video := targeted.Params[0]; video.On == nil || *video.On != "file" || video.Extensions == nil || (*video.Extensions)[0] != "mkv" {
		t.Fatalf("file target: %+v", video)
	}
	if device := targeted.Params[2]; device.ChoicesFrom == nil || *device.ChoicesFrom != "tool.devices" {
		t.Fatalf("choices: %+v", device)
	}
	if folder := targeted.Params[1]; folder.On != nil || folder.Extensions != nil || folder.ChoicesFrom != nil {
		t.Fatalf("no target: %+v", folder)
	}
	if fromPlugin.Plugin == nil || fromPlugin.Plugin.Id != "tool" || fromPlugin.Plugin.Name.Fr != "Outil" {
		t.Fatalf("plugin: %+v", fromPlugin.Plugin)
	}
}

func TestCommandEntryListsItsPluginViews(t *testing.T) {
	text := commands.Text{En: "x", Fr: "x", Es: "x"}
	view := commands.PluginView{
		ID: "downloads", Name: text, Icon: "download", Source: "jd.state",
		Refresh: commands.Duration{Duration: 3 * time.Second}, Widget: true,
		Sections: []commands.ViewSection{
			{Key: "downloads", Name: text, RowActions: []string{"enable"}},
			{Key: "grabber", Name: text, Empty: &text},
		},
		States: []commands.ViewState{{Key: "running", Label: text, Tone: "active"}},
		Actions: []commands.ViewAction{
			{ID: "pause", Name: text, Icon: "pause", Command: "jd.pause", On: commands.OnView},
			{ID: "enable", Name: text, Icon: "check", Command: "jd.enable", On: commands.OnRow, Items: "links", Confirm: true},
		},
	}
	converted := toCommandEntry(commands.Entry{ID: "jd.state", Plugin: &commands.PluginRef{ID: "jd", Views: []commands.PluginView{view}}})
	views := converted.Plugin.Views
	if views == nil || len(*views) != 1 {
		t.Fatalf("views: %+v", views)
	}
	got := (*views)[0]
	if got.Permission != "plugins:view.jd.downloads" || got.RefreshSeconds != 3 || !got.Widget || got.Sections[1].Empty == nil || got.Sections[0].Empty != nil {
		t.Fatalf("view: %+v", got)
	}
	if got.States[0].Tone != "active" || got.Actions[0].Items != nil || got.Actions[1].Items == nil || *got.Actions[1].Items != "links" || !got.Actions[1].Confirm {
		t.Fatalf("states and actions: %+v %+v", got.States, got.Actions)
	}
}
